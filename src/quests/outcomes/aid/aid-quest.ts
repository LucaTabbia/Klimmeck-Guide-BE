import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { refIdOf } from 'src/mongo/document-id';
import {
    questSlotsOf,
    RankSlot,
    soloSlots,
} from 'src/quests/acceptance/quest-capacity';
import { isRecord } from '../combat/combat-context';
import { type QuestEnemyRef, validQuestEnemiesOf } from '../quest-enemies';

export const AID_TITLE_PREFIX = 'Soccorso: ';

export interface AidSourceQuest {
    _id: Types.ObjectId;
    infos: {
        title: string;
        description?: string | null;
        type?: QuestType;
        markerLocation: unknown;
        enemies?: unknown;
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
        pet?: unknown;
        cure?: unknown;
        rankPrizes?: unknown[] | null;
    } | null;
    rescue?: { failedQuest?: unknown } | null;
}

export interface AidQuestDraft {
    _id: Types.ObjectId;
    infos: {
        title: string;
        description: string | null;
        type: QuestType.aid;
        markerLocation: unknown;
        enemies: QuestEnemyRef[];
        timeToComplete: number | null;
        relatedLore: unknown[];
    };
    requirements: {
        minTitle: TitleType | null;
        requiredPoints: null;
        requiredAdventurers: RankSlot[];
        recommendedLoot: unknown[];
    };
    prizes: {
        prizeCoins: unknown;
        xpPrize: unknown;
        prizeItem: unknown;
        randomLoot: unknown[];
        spell: unknown;
        pet: Types.ObjectId | null;
        rankPrizes?: unknown[];
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

// la aid non eredita la cura della quest fallita (Phase 18 D-23): il soccorritore non è il paziente
function clonedPrizesOf(
    prizes: AidSourceQuest['prizes'],
): AidQuestDraft['prizes'] {
    const cloned: AidQuestDraft['prizes'] = {
        prizeCoins: prizes?.prizeCoins ?? null,
        xpPrize: prizes?.xpPrize ?? null,
        prizeItem: prizes?.prizeItem ?? null,
        randomLoot: [...(prizes?.randomLoot ?? [])],
        spell: prizes?.spell ?? null,
        pet: refIdOf(prizes?.pet),
    };
    const blocks = (prizes?.rankPrizes ?? []).filter(isRecord);
    if (blocks.length === 0) return cloned;
    return { ...cloned, rankPrizes: blocks.map(clonedRankBlockOf) };
}

// blocchi per titolo della quest di gruppo copiati campo per campo (un sottodocumento idratato non si spande), senza cura (D-11, Phase 18 D-23)
function clonedRankBlockOf(block: Record<string, unknown>) {
    const randomLoot = block.randomLoot;
    return {
        title: block.title,
        prizeCoins: block.prizeCoins ?? null,
        xpPrize: block.xpPrize ?? null,
        prizeItem: block.prizeItem ?? null,
        randomLoot: Array.isArray(randomLoot)
            ? [...(randomLoot as unknown[])]
            : [],
        spell: block.spell ?? null,
        pet: refIdOf(block.pet),
        cure: null,
    };
}

// posti della aid identici a quelli della quest fallita (utente 2026-10-26: "I posti della aid sono identici a quelli della missione da cui è nata."); slot assenti o non validi ⇒ un posto jolly, mai una aid inaccettabile (T-09-86)
// i posti sono quelli letti dalla regola del tipo: la aid di una enemy non eredita un posto a titolo (quick 261111-enm)
export function aidSlotsOf(
    requiredAdventurers: unknown,
    type?: QuestType,
): RankSlot[] {
    const slots = questSlotsOf(type, requiredAdventurers);
    if (slots === 'invalid') return soloSlots();
    return slots.map(({ title, count }) => ({ title, count }));
}

// clone della quest fallita (D-08 emendata il 2026-10-26): una aid per combattimento perso, stessi posti della quest fallita, mai ripetibile; in una catena si clona sempre l'originale (D-09)
// la aid non porta `generated` (D-17): non conta nel tetto né rilancia il generatore
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
            description: infos.description ?? null,
            type: QuestType.aid,
            markerLocation:
                refIdOf(infos.markerLocation) ?? infos.markerLocation,
            enemies: validQuestEnemiesOf(infos),
            timeToComplete: infos.timeToComplete ?? null,
            relatedLore: [...(infos.relatedLore ?? [])],
        },
        requirements: {
            minTitle: requirements?.minTitle ?? null,
            requiredPoints: null,
            requiredAdventurers: aidSlotsOf(
                requirements?.requiredAdventurers,
                infos.type,
            ),
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
