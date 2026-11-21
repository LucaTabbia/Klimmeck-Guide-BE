import { Types } from 'mongoose';
import { companionDisplayName } from 'src/characters/pets/companion-life';
import { applyTradeToInventory } from 'src/economy/trade/trade-inventory';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import {
    applyWoundCorrection,
    innkeeperInjuriesOf,
    type WoundEffects,
} from 'src/quests/outcomes/injuries/innkeeper-injuries';
import {
    type OverrideCompanion,
    overrideParticipantOf,
} from 'src/quests/outcomes/gm-overrides';
import { companionAssetsAfter } from 'src/quests/outcomes/guard/guard-outcome';
import {
    consumablesSpent,
    sellLine,
    spellsSpent,
} from 'src/quests/outcomes/outcome-plan';
import type { CompanionCatalogEntry } from 'src/quests/outcomes/pets/companion-after-fight';
import type { ResolutionCharacter } from 'src/quests/outcomes/resolution-loader.service';
import { presentOnly } from './ids';
import type { MissionFightEffectsRecord } from './mission-draft.model';

// compagno equipaggiato a inizio scontro (D-17, D-38): massimo del suo livello, nome mostrato fotografato alla simulazione
export interface FightCompanion {
    pet: Types.ObjectId;
    name: string;
    lifeBefore: number;
    maxLifePoints: number;
}

// stato all'inizio di uno scontro e suoi limiti: gli stessi di validateOverrides (D-06, D-17)
export interface FightStart {
    hpBefore: number;
    injuriesBefore: InjuryType[];
    // ferite dell'oste all'inizio dello scontro: sottoinsieme di injuriesBefore (Phase 25 D-13)
    innkeeperInjuriesBefore: InjuryType[];
    consumablesAvailable: { item: Types.ObjectId; quantity: number }[];
    spellsAvailable: { spell: Types.ObjectId; usages: number }[];
    companion: FightCompanion | null;
}

// nessun istante di recupero nella sovrapposizione: la simulazione non programma job
const NO_RECOVERY_TIMES: ReadonlyMap<string, number> = new Map();
const EPOCH = new Date(0);

function afterFight(
    state: ResolutionCharacter,
    effects: ParticipantEffects,
    petCatalog: ReadonlyMap<string, CompanionCatalogEntry>,
): ResolutionCharacter {
    const wounds = applyWoundCorrection(state.status, effects);
    const spent = consumablesSpent(
        state.assets?.ownedItems,
        effects.consumablesUsed,
    );
    const { ownedItems, ownedEquipments } = applyTradeToInventory(
        state.assets ?? {},
        spent.map(sellLine),
    );
    const spells = spellsSpent(
        state._id,
        state.status.spellStates ?? [],
        effects.spellsUsed,
        NO_RECOVERY_TIMES,
        EPOCH,
    );
    const fought: ResolutionCharacter = {
        ...state,
        status: {
            ...state.status,
            currentLifePoints: effects.hpAfter,
            injuries: wounds.injuries,
            innkeeperInjuries: wounds.innkeeperInjuries,
            spellStates: spells.spellStates ?? state.status.spellStates,
        },
        assets: { ...state.assets, ownedItems, ownedEquipments },
    };
    return {
        ...fought,
        ...companionAssetsAfter<ResolutionCharacter>(
            fought.assets,
            effects.companionLifeAfter,
            petCatalog,
        ),
    };
}

// D-02, D-04, D-26: snapshot reale con sovrapposti gli effetti effettivi degli scontri precedenti; lo snapshot letto non si muta
export function stateBeforeFight(
    snapshot: ResolutionCharacter,
    previous: readonly ParticipantEffects[],
    petCatalog: ReadonlyMap<string, CompanionCatalogEntry>,
): ResolutionCharacter {
    return previous.reduce(
        (state, effects) => afterFight(state, effects, petCatalog),
        snapshot,
    );
}

const byHex = (totals: ReadonlyMap<string, number>) =>
    [...totals.entries()].sort(([left], [right]) => left.localeCompare(right));

// limiti del compagno dalla regola delle correzioni (D-17, D-38); nome mostrato fotografato alla simulazione
function fightCompanionOf(
    state: ResolutionCharacter,
    bounds: OverrideCompanion | null,
    petCatalog: ReadonlyMap<string, CompanionCatalogEntry>,
): FightCompanion | null {
    const pet = refIdOf(state.assets?.pet);
    if (!bounds || !pet) return null;
    const entry = state.assets?.ownedPets?.find((owned) =>
        refIdOf(owned.pet)?.equals(pet),
    );
    return {
        pet,
        name: companionDisplayName(
            entry?.name,
            petCatalog.get(pet.toHexString())?.name,
        ),
        ...bounds,
    };
}

export function fightStartOf(
    state: ResolutionCharacter,
    petCatalog: ReadonlyMap<string, CompanionCatalogEntry>,
): FightStart {
    const bounds = overrideParticipantOf(state, petCatalog);
    return {
        hpBefore: bounds.currentLifePoints,
        injuriesBefore: [...(state.status.injuries ?? [])],
        innkeeperInjuriesBefore: innkeeperInjuriesOf(state.status),
        consumablesAvailable: byHex(bounds.ownedLoot).map(
            ([hex, quantity]) => ({ item: new Types.ObjectId(hex), quantity }),
        ),
        spellsAvailable: byHex(bounds.activeSpells).map(([hex, usages]) => ({
            spell: new Types.ObjectId(hex),
            usages,
        })),
        companion: fightCompanionOf(state, bounds.companion, petCatalog),
    };
}

// una correzione toglie solo ferite presenti all'inizio dello scontro e non riaggiunge una ferita ancora portata (Phase 25 D-13, D-16)
export function assertWoundCorrectionAllowed(
    injuriesBefore: readonly InjuryType[],
    effects: WoundEffects,
): void {
    const removed = effects.injuriesRemoved ?? [];
    if (removed.some((injury) => !injuriesBefore.includes(injury)))
        throw GameRuleException.outcomeOverrideInvalid();
    const stillCarried = injuriesBefore.filter(
        (injury) => !removed.includes(injury),
    );
    if (effects.injuriesAdded.some((injury) => stillCarried.includes(injury)))
        throw GameRuleException.outcomeOverrideInvalid();
}

// nessuna rimozione = chiave assente, anche sulle bozze di prima (Phase 25 D-13)
function removalsOf(
    injuriesRemoved: readonly InjuryType[] | null | undefined,
): { injuriesRemoved?: InjuryType[] } {
    const removed = injuriesRemoved ?? [];
    return removed.length === 0 ? {} : { injuriesRemoved: [...removed] };
}

export function effectsRecordOf(
    effects: ParticipantEffects,
): MissionFightEffectsRecord {
    return {
        hpAfter: effects.hpAfter,
        injuriesAdded: [...effects.injuriesAdded],
        consumablesUsed: presentOnly(
            effects.consumablesUsed.map(({ itemId, quantity }) => {
                const item = objectIdFromHex(itemId);
                return item ? { item, quantity } : null;
            }),
        ),
        spellsUsed: presentOnly(
            effects.spellsUsed.map(({ spellId, usages }) => {
                const spell = objectIdFromHex(spellId);
                return spell ? { spell, usages } : null;
            }),
        ),
        companionLifeAfter: effects.companionLifeAfter ?? null,
        ...removalsOf(effects.injuriesRemoved),
    };
}

export function participantEffectsOf(
    characterHex: string,
    record: MissionFightEffectsRecord,
): ParticipantEffects {
    return {
        characterId: characterHex,
        hpAfter: record.hpAfter,
        injuriesAdded: [...record.injuriesAdded],
        consumablesUsed: record.consumablesUsed.map(({ item, quantity }) => ({
            itemId: item.toHexString(),
            quantity,
        })),
        spellsUsed: record.spellsUsed.map(({ spell, usages }) => ({
            spellId: spell.toHexString(),
            usages,
        })),
        ...(record.companionLifeAfter == null
            ? {}
            : { companionLifeAfter: record.companionLifeAfter }),
        ...removalsOf(record.injuriesRemoved),
    };
}
