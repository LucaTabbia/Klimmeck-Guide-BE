import { Types } from 'mongoose';
import { applyTradeToInventory } from 'src/economy/trade/trade-inventory';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { objectIdFromHex } from 'src/mongo/document-id';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import { overrideParticipantOf } from 'src/quests/outcomes/gm-overrides';
import {
    consumablesSpent,
    sellLine,
    spellsSpent,
    woundsAfter,
} from 'src/quests/outcomes/outcome-plan';
import type { ResolutionCharacter } from 'src/quests/outcomes/resolution-loader.service';
import { presentOnly } from './ids';
import type { MissionFightEffectsRecord } from './mission-draft.model';

// stato all'inizio di uno scontro e suoi limiti: gli stessi di validateOverrides (D-06, D-17)
export interface FightStart {
    hpBefore: number;
    injuriesBefore: InjuryType[];
    consumablesAvailable: { item: Types.ObjectId; quantity: number }[];
    spellsAvailable: { spell: Types.ObjectId; usages: number }[];
}

// nessun istante di recupero nella sovrapposizione: la simulazione non programma job
const NO_RECOVERY_TIMES: ReadonlyMap<string, number> = new Map();
const EPOCH = new Date(0);

function afterFight(
    state: ResolutionCharacter,
    effects: ParticipantEffects,
): ResolutionCharacter {
    const wounds = woundsAfter(
        state.status.injuries ?? [],
        effects.injuriesAdded,
    );
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
    return {
        ...state,
        status: {
            ...state.status,
            currentLifePoints: effects.hpAfter,
            injuries: wounds.injuries,
            spellStates: spells.spellStates ?? state.status.spellStates,
        },
        assets: { ...state.assets, ownedItems, ownedEquipments },
    };
}

// D-02, D-04: snapshot reale con sovrapposti gli effetti effettivi degli scontri precedenti; lo snapshot letto non si muta
export function stateBeforeFight(
    snapshot: ResolutionCharacter,
    previous: readonly ParticipantEffects[],
): ResolutionCharacter {
    return previous.reduce(afterFight, snapshot);
}

const byHex = (totals: ReadonlyMap<string, number>) =>
    [...totals.entries()].sort(([left], [right]) => left.localeCompare(right));

export function fightStartOf(state: ResolutionCharacter): FightStart {
    const bounds = overrideParticipantOf(state);
    return {
        hpBefore: bounds.currentLifePoints,
        injuriesBefore: [...(state.status.injuries ?? [])],
        consumablesAvailable: byHex(bounds.ownedLoot).map(
            ([hex, quantity]) => ({ item: new Types.ObjectId(hex), quantity }),
        ),
        spellsAvailable: byHex(bounds.activeSpells).map(([hex, usages]) => ({
            spell: new Types.ObjectId(hex),
            usages,
        })),
    };
}

// D-14: le ferite di prima della missione non si toccano; guarirle è il premio cure
export function assertAddsOnlyNewInjuries(
    injuriesBefore: readonly InjuryType[],
    added: readonly InjuryType[],
): void {
    if (added.some((injury) => injuriesBefore.includes(injury)))
        throw GameRuleException.outcomeOverrideInvalid();
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
    };
}
