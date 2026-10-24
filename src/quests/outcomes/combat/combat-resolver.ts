import { EffectType } from 'src/models/enums/effect-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { SlotType } from 'src/models/enums/slot_type.enum';
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
}

export interface CombatEnemy {
    id: string;
    name: string;
    lifePoints: number;
    xp: number;
    damages: CombatDamages;
    baseWeaknesses: string[];
    energyWeaknesses: string[];
}

export interface CombatContext {
    quest: { id: string; type: QuestType; title: string };
    enemy: CombatEnemy;
    participants: CombatParticipant[];
}

export type CombatVerdict = 'success' | 'failure';

// un esito per partecipante (D-02, D-05): hpAfter ≥ 1 (D-07), clampato anche dal piano dell'esito (difesa in profondità)
export interface ParticipantOutcome {
    characterId: string;
    outcome: CombatVerdict;
    hpAfter: number;
    injuriesAdded: InjuryType[];
    consumablesUsed: { itemId: string; quantity: number }[];
    spellsUsed: { spellId: string; usages: number }[];
}

// la porta (D-02): contesto puro già idratato in ingresso, nessun I/O; le regole sono dell'utente e sostituiscono il segnaposto via DI
export abstract class CombatResolver {
    abstract resolve(
        context: CombatContext,
        chance: ChanceSource,
    ): ParticipantOutcome[];
}
