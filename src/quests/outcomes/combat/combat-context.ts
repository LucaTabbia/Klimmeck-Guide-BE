import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { SlotType } from 'src/models/enums/slot_type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { CombatContext, CombatDamages } from './combat-resolver';

export interface CombatCharacterSnapshot {
    _id: Types.ObjectId;
    status: {
        title: TitleType;
        level?: number;
        currentLifePoints?: number;
        maxLifePoints?: number;
        injuries?: InjuryType[];
    };
    assets?: {
        wearedEquipment?: Partial<Record<SlotType, unknown>> | null;
        activeSpells?: { spell?: unknown; usages?: number }[];
        ownedItems?: { itemType?: string; item?: unknown; quantity?: number }[];
    } | null;
}

export interface CombatEnemySnapshot {
    _id: Types.ObjectId;
    name?: string;
    lifePoints?: number;
    xp?: number;
    damages?: unknown;
    baseWeaknesses?: string[];
    energyWeaknesses?: string[];
}

export interface CombatHydration {
    quest: { _id: Types.ObjectId; infos: { type: QuestType; title: string } };
    enemy: CombatEnemySnapshot;
    participants: CombatCharacterSnapshot[];
    equipment: ReadonlyMap<string, { damages?: unknown }>;
    spells: ReadonlyMap<string, { energyDamage?: unknown }>;
    loot: ReadonlyMap<string, { effect?: unknown; power?: unknown }>;
}

export interface CombatCatalogRefs {
    equipmentIds: Types.ObjectId[];
    spellIds: Types.ObjectId[];
    lootIds: Types.ObjectId[];
}

export function normalizeDamages(raw: unknown): CombatDamages {
    void raw;
    throw new Error('not implemented');
}

export function combatCatalogRefsOf(
    participants: readonly CombatCharacterSnapshot[],
): CombatCatalogRefs {
    void participants;
    throw new Error('not implemented');
}

export function buildCombatContext(hydration: CombatHydration): CombatContext {
    void hydration;
    throw new Error('not implemented');
}
