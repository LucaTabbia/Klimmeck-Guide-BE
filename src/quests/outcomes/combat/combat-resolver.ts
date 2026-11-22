import { AccessoryUseType } from 'src/models/enums/accessory-use-type.enum';
import { DamageType } from 'src/models/enums/damage-type.enum';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { EnergyType } from 'src/models/enums/energy-type.enum';
import { EquipType } from 'src/models/enums/equip-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { SlotType } from 'src/models/enums/slot-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';

export interface DamageEntry {
    type: string;
    power: number;
}

export interface CombatDamages {
    base: DamageEntry[];
    energy: DamageEntry[];
}

export interface CombatEquipment {
    itemId: string;
    slot: SlotType;
    damages: CombatDamages;
    equipType: EquipType | null;
    // fasi d'uso dei gioielli (D-24): la semantica è del motore dell'utente, il segnaposto le ignora
    accessoryUseTypes: AccessoryUseType[] | null;
}

export interface CombatSpell {
    spellId: string;
    usages: number;
    damage: DamageEntry | null;
}

export interface CombatConsumable {
    itemId: string;
    quantity: number;
    effect: EffectType | null;
    power: number;
}

export interface CombatCompanion {
    petId: string;
    attack: CombatDamages;
    defense: CombatDamages;
    currentLifePoints: number;
    maxLifePoints: number;
    xp: number;
}

export interface CombatParticipant {
    characterId: string;
    title: TitleType;
    level: number;
    currentLifePoints: number;
    maxLifePoints: number;
    injuries: InjuryType[];
    equipment: CombatEquipment[];
    activeSpells: CombatSpell[];
    consumables: CombatConsumable[];
    // il compagno equipaggiato (D-20): entra con la vita di companion-life.ts, esce con companionLifeAfter (D-03)
    companion: CombatCompanion | null;
}

export interface CombatEnemy {
    id: string;
    name: string;
    lifePoints: number;
    xp: number;
    damages: CombatDamages;
    weaknesses: { base: DamageType[]; energy: EnergyType[] };
    quantity: number;
}

export interface CombatContext {
    quest: { id: string; type: QuestType; title: string };
    // nell'ordine della quest: nelle dungeon l'ordine delle tappe (D-12)
    enemies: CombatEnemy[];
    participants: CombatParticipant[];
}

export type CombatVerdict = 'success' | 'failure';

// gli effetti del combattimento su un partecipante (D-02, D-05): hpAfter ≥ 1 (D-07), clampato anche dal piano dell'esito (difesa in profondità)
export interface ParticipantEffects {
    characterId: string;
    hpAfter: number;
    injuriesAdded: InjuryType[];
    consumablesUsed: { itemId: string; quantity: number }[];
    spellsUsed: { spellId: string; usages: number }[];
    // vita del compagno equipaggiato dopo lo scontro, in [1, maxLifePoints] (D-03); assente = nessun compagno nello scontro
    companionLifeAfter?: number;
    // xp dei nemici dei soli scontri da cui il compagno caduto in una sequenza è uscito in piedi (D-13); assente = tutti i nemici, salvo il compagno caduto nello scontro singolo (companionShareOf)
    companionEnemiesXp?: number;
    // ferite tolte dall'oste prima delle aggiunte di questo esito (Phase 25 D-13); assente = nessuna
    injuriesRemoved?: InjuryType[];
    // sottoinsieme di injuriesAdded inflitto a mano dall'oste (Phase 25 D-12); assente = nessuna
    innkeeperInjuries?: InjuryType[];
}

// effetti fusi di scontri in sequenza (D-12): vale la vita del compagno dell'ultimo scontro in cui c'era
export function lastCompanionLifeOf(
    earlier: ParticipantEffects,
    later: ParticipantEffects,
): Pick<ParticipantEffects, 'companionLifeAfter'> {
    const companionLifeAfter =
        later.companionLifeAfter ?? earlier.companionLifeAfter;
    return companionLifeAfter === undefined ? {} : { companionLifeAfter };
}

// un solo verdetto per combattimento (A3, utente 2026-10-25): chi combatte insieme vince o perde insieme; gli effetti restano per partecipante
export interface CombatResolution {
    verdict: CombatVerdict;
    participants: ParticipantEffects[];
}

// la porta (D-02): contesto puro già idratato in ingresso, nessun I/O; le regole sono dell'utente e sostituiscono il segnaposto via DI
export abstract class CombatResolver {
    abstract resolve(
        context: CombatContext,
        chance: ChanceSource,
    ): CombatResolution;
}
