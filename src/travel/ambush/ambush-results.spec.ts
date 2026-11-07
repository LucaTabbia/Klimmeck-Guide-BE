import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { buildAmbushReport } from '../../../test/travel/ambush-report.fixture';
import { ambushResultDraftsOf } from './ambush-results';

describe('ambushResultDraftsOf', () => {
    const characterId = new Types.ObjectId();

    it('maps a held report to an ambush quest result (D-13, D-14)', () => {
        const report = buildAmbushReport({
            injuriesAdded: [InjuryType.brokenLeftLeg],
            spellsUsed: [{ spell: new Types.ObjectId(), usages: 1 }],
            loreUnlocked: [new Types.ObjectId()],
        });

        const [draft] = ambushResultDraftsOf([report], characterId);

        expect(draft).toEqual({
            _id: report.resultId,
            character: characterId,
            user: report.user,
            kind: 'ambush',
            quest: null,
            ambush: {
                at: report.at,
                nearCity: report.nearCity,
                reachedCity: null,
            },
            outcome: 'success',
            resolvedAt: report.at,
            acknowledgedAt: null,
            hpBefore: report.hpBefore,
            hpAfter: report.hpAfter,
            maxLifePoints: report.maxLifePoints,
            injuriesAdded: [InjuryType.brokenLeftLeg],
            consumablesUsed: [],
            spellsUsed: report.spellsUsed,
            rewards: { coins: report.coins, items: [], pet: null },
            xpGained: report.xpGained,
            xpBefore: report.xpBefore,
            xpAfter: report.xpAfter,
            levelBefore: report.levelBefore,
            levelAfter: report.levelAfter,
            titleBefore: report.titleBefore,
            titleAfter: report.titleAfter,
            spellLearned: null,
            loreUnlocked: report.loreUnlocked,
            enemies: report.enemies,
            stagesCleared: null,
            stagesTotal: null,
            rescuedCharacters: [],
        });
        expect(Object.keys(draft).sort()).toEqual([
            '_id',
            'acknowledgedAt',
            'ambush',
            'character',
            'consumablesUsed',
            'enemies',
            'hpAfter',
            'hpBefore',
            'injuriesAdded',
            'kind',
            'levelAfter',
            'levelBefore',
            'loreUnlocked',
            'maxLifePoints',
            'outcome',
            'quest',
            'rescuedCharacters',
            'resolvedAt',
            'rewards',
            'spellLearned',
            'spellsUsed',
            'stagesCleared',
            'stagesTotal',
            'titleAfter',
            'titleBefore',
            'user',
            'xpAfter',
            'xpBefore',
            'xpGained',
        ]);
    });

    it('delivers an old held report without unlocked lore as an empty list (D-09, Pitfall 3)', () => {
        const old = buildAmbushReport();
        expect(Object.keys(old)).not.toContain('loreUnlocked');

        const [draft] = ambushResultDraftsOf([old], characterId);

        expect(draft.loreUnlocked).toEqual([]);
    });

    it('keeps the reached city of a defeat (D-13, D-14)', () => {
        const reachedCity = { id: new Types.ObjectId(), name: 'Alba' };
        const report = buildAmbushReport({
            outcome: QuestOutcome.failure,
            reachedCity,
        });

        const [draft] = ambushResultDraftsOf([report], characterId);

        expect(draft.outcome).toBe('failure');
        expect(draft.ambush.reachedCity).toEqual(reachedCity);
    });

    it('orders the drafts by ambush instant (D-13)', () => {
        const late = buildAmbushReport({
            at: new Date('2026-10-21T12:00:00.000Z'),
        });
        const early = buildAmbushReport({
            at: new Date('2026-10-21T09:00:00.000Z'),
        });

        const drafts = ambushResultDraftsOf([late, early], characterId);

        expect(drafts.map(({ _id }) => _id)).toEqual([
            early.resultId,
            late.resultId,
        ]);
    });

    it('answers no drafts without held reports (D-13)', () => {
        expect(ambushResultDraftsOf([], characterId)).toEqual([]);
    });
});
