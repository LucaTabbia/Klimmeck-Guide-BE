import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';

export const AID_TITLE_PREFIX = '';

export interface AidSourceQuest {
    _id: Types.ObjectId;
    infos: {
        title: string;
        markerLocation: unknown;
        enemy?: unknown;
        timeToComplete?: number | null;
        relatedLore?: unknown[] | null;
    };
    requirements?: {
        minTitle?: TitleType | null;
        recommendedLoot?: unknown[] | null;
    } | null;
    prizes?: {
        prizeCoins?: unknown;
        xpPrize?: unknown;
        prizeItem?: unknown;
        randomLoot?: unknown[] | null;
        spell?: unknown;
    } | null;
    rescue?: { failedQuest?: unknown } | null;
}

export interface AidQuestDraft {
    _id: Types.ObjectId;
    infos: {
        title: string;
        type: QuestType.aid;
        markerLocation: unknown;
        enemy: Types.ObjectId | null;
        timeToComplete: number | null;
        relatedLore: unknown[];
    };
    requirements: {
        minTitle: TitleType | null;
        requiredPoints: null;
        requiredAdventurers: { title: null; count: 1 }[];
        recommendedLoot: unknown[];
    };
    prizes: {
        prizeCoins: unknown;
        xpPrize: unknown;
        prizeItem: unknown;
        randomLoot: unknown[];
        spell: unknown;
    };
    registeredAdventurers: [];
    concludedAt: null;
    rescue: { character: Types.ObjectId; failedQuest: Types.ObjectId };
}

export function buildAidQuest(
    original: AidSourceQuest,
    injuredId: Types.ObjectId,
    aidId: Types.ObjectId,
): AidQuestDraft {
    void original;
    void injuredId;
    void aidId;
    throw new Error('not implemented');
}
