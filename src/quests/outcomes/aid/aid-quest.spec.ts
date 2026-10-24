import { Types } from 'mongoose';
import {
    AID_TITLE_PREFIX,
    AidSourceQuest,
    buildAidQuest,
} from 'src/quests/outcomes/aid/aid-quest';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';

const ORIGINAL_ID = new Types.ObjectId('64b0000000000000000000c1');
const MARKER_ID = new Types.ObjectId('64b0000000000000000000c2');
const ENEMY_ID = new Types.ObjectId('64b0000000000000000000c3');
const LORE_ID = new Types.ObjectId('64b0000000000000000000c4');
const INJURED_ID = new Types.ObjectId('64b0000000000000000000c5');
const AID_ID = new Types.ObjectId('64b0000000000000000000c6');
const RESCUER_ID = new Types.ObjectId('64b0000000000000000000c7');
const NEXT_AID_ID = new Types.ObjectId('64b0000000000000000000c8');
const LOOT_ID = new Types.ObjectId('64b0000000000000000000c9');

const lootEntry = { itemType: 'LootItem', item: LOOT_ID, quantity: 1 };

const original: AidSourceQuest = {
    _id: ORIGINAL_ID,
    infos: {
        title: 'Il drago di Valantar',
        type: QuestType.boss,
        markerLocation: MARKER_ID,
        enemy: ENEMY_ID,
        timeToComplete: 3600000,
        relatedLore: [LORE_ID],
    } as AidSourceQuest['infos'],
    requirements: {
        minTitle: TitleType.hero,
        requiredPoints: 10,
        requiredAdventurers: [{ title: TitleType.hero, count: 5 }],
        recommendedLoot: [],
    } as AidSourceQuest['requirements'],
    prizes: {
        prizeCoins: { gold: 5, silver: 0, copper: 0 },
        xpPrize: 800,
        prizeItem: null,
        randomLoot: [lootEntry],
        spell: null,
    },
};

describe('buildAidQuest', () => {
    const aid = buildAidQuest(original, INJURED_ID, AID_ID);

    it('clones the failed quest as an aid titled after it', () => {
        expect(aid._id).toBe(AID_ID);
        expect(aid.infos.title).toBe('Soccorso: Il drago di Valantar');
        expect(aid.infos.type).toBe('aid');
        expect(aid.infos.markerLocation).toEqual(MARKER_ID);
        expect(aid.infos.enemy).toEqual(ENEMY_ID);
        expect(aid.infos.timeToComplete).toBe(3600000);
        expect(aid.infos.relatedLore).toEqual([LORE_ID]);
    });

    it('opens one wildcard seat at no cost, keeping the minimum title', () => {
        expect(aid.requirements).toEqual({
            minTitle: 'hero',
            requiredPoints: null,
            requiredAdventurers: [{ title: null, count: 1 }],
            recommendedLoot: [],
        });
    });

    it('copies the prizes without sharing references', () => {
        expect(aid.prizes).toEqual(original.prizes);
        expect(aid.prizes).not.toBe(original.prizes);
        expect(aid.prizes.randomLoot).not.toBe(original.prizes?.randomLoot);
    });

    it('starts open, empty and linked to the injured character', () => {
        expect(aid.registeredAdventurers).toEqual([]);
        expect(aid.concludedAt).toBeNull();
        expect(aid.rescue).toEqual({
            character: INJURED_ID,
            failedQuest: ORIGINAL_ID,
        });
    });

    it('always points a chained aid back to the original failed quest', () => {
        const chained = buildAidQuest(
            {
                ...original,
                _id: AID_ID,
                infos: { ...original.infos, title: aid.infos.title },
                rescue: { failedQuest: ORIGINAL_ID },
            },
            RESCUER_ID,
            NEXT_AID_ID,
        );

        expect(chained.rescue.failedQuest).toEqual(ORIGINAL_ID);
        expect(chained.rescue.character).toBe(RESCUER_ID);
        expect(chained.infos.title).toBe(
            `${AID_TITLE_PREFIX}Il drago di Valantar`,
        );
    });

    it('fills the missing fields with empty defaults', () => {
        const bare = buildAidQuest(
            {
                _id: ORIGINAL_ID,
                infos: {
                    title: 'Sentiero',
                    markerLocation: MARKER_ID,
                    enemy: null,
                },
            },
            INJURED_ID,
            AID_ID,
        );

        expect(bare.infos.enemy).toBeNull();
        expect(bare.infos.timeToComplete).toBeNull();
        expect(bare.prizes).toEqual({
            prizeCoins: null,
            xpPrize: null,
            prizeItem: null,
            randomLoot: [],
            spell: null,
        });
    });
});
