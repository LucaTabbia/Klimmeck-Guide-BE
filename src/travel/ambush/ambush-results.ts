import type { Types } from 'mongoose';
import type { CoinPurse } from 'src/economy/coins';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestResultKind } from 'src/models/enums/quest-result-kind.enum';
import type { TitleType } from 'src/models/enums/title-type.enum';
import { compareIds } from 'src/roads/road-route';
import type {
    ConsumableUsage,
    QuestEnemyDraft,
} from 'src/quests/outcomes/outcome-plan';
import type { AmbushCity, AmbushReportDraft } from './ambush-plan';

export interface AmbushResultDraft {
    _id: Types.ObjectId;
    character: Types.ObjectId;
    user: Types.ObjectId;
    kind: QuestResultKind.ambush;
    quest: null;
    ambush: { at: Date; nearCity: AmbushCity; reachedCity: AmbushCity | null };
    outcome: AmbushReportDraft['outcome'];
    resolvedAt: Date;
    acknowledgedAt: null;
    hpBefore: number;
    hpAfter: number;
    maxLifePoints: number;
    injuriesAdded: InjuryType[];
    consumablesUsed: ConsumableUsage[];
    spellsUsed: { spell: Types.ObjectId; usages: number }[];
    rewards: { coins: CoinPurse; items: []; pet: null };
    xpGained: number;
    xpBefore: number;
    xpAfter: number;
    levelBefore: number;
    levelAfter: number;
    titleBefore: TitleType;
    titleAfter: TitleType;
    spellLearned: null;
    enemies: QuestEnemyDraft[];
    stagesCleared: null;
    stagesTotal: null;
    rescuedCharacters: [];
}

const byAmbushInstant = (a: AmbushReportDraft, b: AmbushReportDraft): number =>
    a.at.getTime() - b.at.getTime() ||
    compareIds(a.resultId.toHexString(), b.resultId.toHexString());

// report → QuestResult kind ambush (D-13, D-14): resolvedAt = at, i report precedono i risultati di quest dello stesso arrivo
export function ambushResultDraftsOf(
    reports: readonly AmbushReportDraft[],
    characterId: Types.ObjectId,
): AmbushResultDraft[] {
    return [...reports]
        .sort(byAmbushInstant)
        .map((report) => resultDraftOf(report, characterId));
}

function resultDraftOf(
    report: AmbushReportDraft,
    characterId: Types.ObjectId,
): AmbushResultDraft {
    return {
        _id: report.resultId,
        character: characterId,
        user: report.user,
        kind: QuestResultKind.ambush,
        quest: null,
        ambush: {
            at: report.at,
            nearCity: report.nearCity,
            reachedCity: report.reachedCity,
        },
        outcome: report.outcome,
        resolvedAt: report.at,
        acknowledgedAt: null,
        hpBefore: report.hpBefore,
        hpAfter: report.hpAfter,
        maxLifePoints: report.maxLifePoints,
        injuriesAdded: report.injuriesAdded,
        consumablesUsed: report.consumablesUsed,
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
        enemies: report.enemies,
        stagesCleared: null,
        stagesTotal: null,
        rescuedCharacters: [],
    };
}
