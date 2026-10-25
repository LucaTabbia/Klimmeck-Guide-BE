import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { refIdOf } from 'src/mongo/document-id';
import { slotRuleOf, slotsOf } from 'src/quests/acceptance/quest-capacity';

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
        requiredAdventurers?: unknown;
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
        requiredAdventurers: { title: null; count: number }[];
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
    rescue: { characters: Types.ObjectId[]; failedQuest: Types.ObjectId };
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

// posti della aid = posti della quest fallita, tutti jolly (default tecnico proposto all'utente, 2026-10-25); slot non validi ⇒ 1, mai una aid inaccettabile (T-09-86)
export function aidSeatsOf(requiredAdventurers: unknown): number {
    const slots = slotsOf(requiredAdventurers);
    if (slots === 'invalid') return 1;
    return Math.max(1, slotRuleOf(slots).total);
}

// clone della quest fallita (D-08 emendata il 2026-10-25): una aid per combattimento perso, posti = posti della quest fallita, mai ripetibile; in una catena si clona sempre l'originale (D-09)
export function buildAidQuest(
    original: AidSourceQuest,
    injuredIds: readonly Types.ObjectId[],
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
            requiredAdventurers: [
                {
                    title: null,
                    count: aidSeatsOf(requirements?.requiredAdventurers),
                },
            ],
            recommendedLoot: [...(requirements?.recommendedLoot ?? [])],
        },
        prizes: clonedPrizesOf(original.prizes),
        registeredAdventurers: [],
        concludedAt: null,
        rescue: {
            characters: [...injuredIds],
            failedQuest: refIdOf(original.rescue?.failedQuest) ?? original._id,
        },
    };
}
