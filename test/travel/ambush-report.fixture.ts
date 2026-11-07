import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { AmbushReportDraft } from 'src/travel/ambush/ambush-plan';

const DEFAULT_AT = new Date('2026-10-21T08:30:00.000Z');

/**
 * Report d'imboscata trattenuto valido per AmbushReportSnapshot (Phase 15 D-13):
 * una vittoria presso Crocevia con un lupo battuto; gli override sostituiscono campi interi.
 */
export function buildAmbushReport(
    overrides: Partial<AmbushReportDraft> = {},
): AmbushReportDraft {
    return {
        resultId: new Types.ObjectId(),
        user: new Types.ObjectId(),
        outcome: QuestOutcome.success,
        at: DEFAULT_AT,
        nearCity: { id: new Types.ObjectId(), name: 'Crocevia' },
        reachedCity: null,
        enemies: [{ enemy: new Types.ObjectId(), quantity: 1 }],
        hpBefore: 1000,
        hpAfter: 800,
        maxLifePoints: 1000,
        injuriesAdded: [],
        consumablesUsed: [],
        spellsUsed: [],
        coins: { gold: 0, silver: 1, copper: 50 },
        xpGained: 47,
        xpBefore: 0,
        xpAfter: 47,
        levelBefore: 1,
        levelAfter: 1,
        titleBefore: TitleType.rookie,
        titleAfter: TitleType.rookie,
        ...overrides,
    };
}
