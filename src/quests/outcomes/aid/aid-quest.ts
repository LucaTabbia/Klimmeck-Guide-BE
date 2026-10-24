import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { refIdOf } from 'src/mongo/document-id';

export const AID_TITLE_PREFIX = 'Soccorso: ';

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

function aidTitleOf(title: string): string {
    return title.startsWith(AID_TITLE_PREFIX)
        ? title
        : AID_TITLE_PREFIX + title;
}

function clonedPrizesOf(
    prizes: AidSourceQuest['prizes'],
): AidQuestDraft['prizes'] {
    return {
        prizeCoins: prizes?.prizeCoins ?? null,
        xpPrize: prizes?.xpPrize ?? null,
        prizeItem: prizes?.prizeItem ?? null,
        randomLoot: [...(prizes?.randomLoot ?? [])],
        spell: prizes?.spell ?? null,
    };
}

// clone della quest fallita (D-08): una aid per ferito, mai ripetibile; in una catena si clona sempre l'originale (D-09)
export function buildAidQuest(
    original: AidSourceQuest,
    injuredId: Types.ObjectId,
    aidId: Types.ObjectId,
): AidQuestDraft {
    const { infos, requirements } = original;
    return {
        _id: aidId,
        infos: {
            title: aidTitleOf(infos.title),
            type: QuestType.aid,
            markerLocation:
                refIdOf(infos.markerLocation) ?? infos.markerLocation,
            enemy: refIdOf(infos.enemy),
            timeToComplete: infos.timeToComplete ?? null,
            relatedLore: [...(infos.relatedLore ?? [])],
        },
        requirements: {
            minTitle: requirements?.minTitle ?? null,
            requiredPoints: null,
            requiredAdventurers: [{ title: null, count: 1 }],
            recommendedLoot: [...(requirements?.recommendedLoot ?? [])],
        },
        prizes: clonedPrizesOf(original.prizes),
        registeredAdventurers: [],
        concludedAt: null,
        rescue: {
            character: injuredId,
            failedQuest: refIdOf(original.rescue?.failedQuest) ?? original._id,
        },
    };
}
