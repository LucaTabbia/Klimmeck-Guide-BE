import { model } from 'mongoose';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
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
