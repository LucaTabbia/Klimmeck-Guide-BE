import { model, Schema as MongooseSchema } from 'mongoose';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { QuestPrizesSchema } from './quest-prizes.model';
import { QuestSchema } from './quest.model';

describe('quest cure', () => {
    const Probe = model('QuestCureProbe', QuestSchema);

    const questWithCure = (cure: Record<string, unknown>) => ({
        ...buildQuest(),
        prizes: { ...buildQuest().prizes, cure },
    });

    const errorKeysOf = (cure: Record<string, unknown>) =>
        Object.keys(
            new Probe(questWithCure(cure)).validateSync()?.errors ?? {},
        );

    it('defaults the cure of a quest to null (D-01)', () => {
        expect(new Probe(buildQuest()).toObject().prizes.cure).toBeNull();
    });

    it('stores a cure with its share and its injuries, without an id (D-01)', () => {
        const quest = new Probe(
            questWithCure({ lifePointsShare: 0.5, canHeal: ['deepCut'] }),
        );

        expect(quest.validateSync()).toBeUndefined();
        expect(quest.toObject().prizes.cure).toEqual({
            lifePointsShare: 0.5,
            canHeal: ['deepCut'],
        });
    });

    it('defaults canHeal to an empty list (D-01)', () => {
        const quest = new Probe(questWithCure({ lifePointsShare: 0 }));

        expect(quest.toObject().prizes.cure?.canHeal).toEqual([]);
    });

    it.each([-0.1, 1.01, 2])(
        'rejects the share %p on validation (D-09)',
        (share) => {
            expect(
                errorKeysOf({ lifePointsShare: share, canHeal: [] }),
            ).toEqual(['prizes.cure.lifePointsShare']);
        },
    );

    it('requires the share of a cure (D-09)', () => {
        expect(errorKeysOf({ canHeal: [] })).toEqual([
            'prizes.cure.lifePointsShare',
        ]);
    });

    it('rejects an injury outside the enum (D-09)', () => {
        expect(
            errorKeysOf({ lifePointsShare: 0.5, canHeal: ['brokenWing'] }),
        ).toEqual(['prizes.cure.canHeal.0']);
    });

    it('accepts the bounds 0 and 1 of the share (D-02)', () => {
        expect(errorKeysOf({ lifePointsShare: 0, canHeal: [] })).toEqual([]);
        expect(errorKeysOf({ lifePointsShare: 1, canHeal: [] })).toEqual([]);
    });
});

describe('quest rank prize blocks', () => {
    const Probe = model('QuestRankPrizeProbe', QuestSchema);

    const questWithBlocks = (rankPrizes: Record<string, unknown>[]) => ({
        ...buildQuest({ infos: { ...buildQuest().infos, type: 'boss' } }),
        prizes: { ...buildQuest().prizes, rankPrizes },
    });

    const errorKeysOf = (rankPrizes: Record<string, unknown>[]) =>
        Object.keys(
            new Probe(questWithBlocks(rankPrizes)).validateSync()?.errors ?? {},
        );

    const blockItemRefPathOf = (field: 'prizeItem' | 'randomLoot') =>
        (
            QuestPrizesSchema.path('rankPrizes') as unknown as {
                schema: MongooseSchema;
            }
        ).schema
            .path(field)
            .schema.path('item').options.refPath;

    it('stores rank prize blocks with the title enum (D-01, D-05)', () => {
        const quest = new Probe(
            questWithBlocks([
                { title: 'mage', xpPrize: 40, randomLoot: [] },
                { title: 'paladin', xpPrize: 20, randomLoot: [] },
            ]),
        );

        expect(quest.validateSync()).toBeUndefined();
        expect(
            quest
                .toObject()
                .prizes.rankPrizes?.map((block) => [
                    block.title,
                    block.xpPrize,
                ]),
        ).toEqual([
            ['mage', 40],
            ['paladin', 20],
        ]);
        expect(errorKeysOf([{ title: 'emperor', randomLoot: [] }])).toEqual([
            'prizes.rankPrizes.0.title',
        ]);
    });

    it('points the block items at absolute ref paths (D-05)', () => {
        expect(blockItemRefPathOf('prizeItem')).toBe(
            'prizes.rankPrizes.prizeItem.itemType',
        );
        expect(blockItemRefPathOf('randomLoot')).toBe(
            'prizes.rankPrizes.randomLoot.itemType',
        );
    });

    it('leaves quests without blocks untouched (D-28)', () => {
        expect(
            Object.keys(new Probe(buildQuest()).toObject().prizes).sort(),
        ).toEqual([
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ]);
    });
});
