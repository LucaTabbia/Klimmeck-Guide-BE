import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import type { OutcomeCharacterSnapshot } from 'src/quests/outcomes/outcome-plan';
import type { UnrewardedPlanInput } from 'src/quests/outcomes/unrewarded-plan';

export const UNREWARDED_NOW = new Date('2026-11-10T12:00:00.000Z');
export const UNREWARDED_IDS = {
    character: new Types.ObjectId('64c0000000000000000000a1'),
    quest: new Types.ObjectId('64c0000000000000000000a2'),
    pending: new Types.ObjectId('64c0000000000000000000a3'),
    result: new Types.ObjectId('64c0000000000000000000a4'),
    user: new Types.ObjectId('64c0000000000000000000a5'),
    enemy: new Types.ObjectId('64c0000000000000000000a6'),
    potion: new Types.ObjectId('64c0000000000000000000a7'),
};

// personaggio di livello 2 con 30 argento, una ferita e due pozioni: base dei piani senza premio (quick 261110-cgd)
export function unrewardedSnapshot(
    status: Partial<OutcomeCharacterSnapshot['status']> = {},
): OutcomeCharacterSnapshot {
    return {
        _id: UNREWARDED_IDS.character,
        status: {
            xp: 300,
            level: 2,
            title: TitleType.adventurer,
            currentLifePoints: 900,
            maxLifePoints: 1200,
            injuries: [InjuryType.sprain],
            coins: { gold: 0, silver: 30, copper: 0 },
            ...status,
        },
        quests: { completedQuests: [], pendingQuest: UNREWARDED_IDS.pending },
        assets: {
            ownedItems: [
                {
                    itemType: 'LootItem',
                    item: UNREWARDED_IDS.potion,
                    quantity: 2,
                },
            ],
            ownedEquipments: [],
        },
    };
}

export function unrewardedBattle(
    overrides: Partial<ParticipantEffects> = {},
): ParticipantEffects {
    return {
        characterId: UNREWARDED_IDS.character.toHexString(),
        hpAfter: 400,
        injuriesAdded: [InjuryType.deepCut],
        consumablesUsed: [
            { itemId: UNREWARDED_IDS.potion.toHexString(), quantity: 1 },
        ],
        spellsUsed: [],
        ...overrides,
    };
}

export function unrewardedInput(
    type: QuestType,
    overrides: Partial<UnrewardedPlanInput> = {},
): UnrewardedPlanInput {
    return {
        resultId: UNREWARDED_IDS.result,
        snapshot: unrewardedSnapshot(),
        quest: {
            _id: UNREWARDED_IDS.quest,
            infos: { type, title: 'Quest di prova' },
        },
        pendingQuestId: UNREWARDED_IDS.pending,
        userId: UNREWARDED_IDS.user,
        battle: null,
        enemies: null,
        spellRecoveryTimes: new Map(),
        now: UNREWARDED_NOW,
        ...overrides,
    };
}
