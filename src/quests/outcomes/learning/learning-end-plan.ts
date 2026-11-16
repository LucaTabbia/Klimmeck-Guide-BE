// fine della parte di apprendimento (Phase 24 D-26, D-31): la magia trovata dal sorteggio diventa conosciuta, la sua lore si sblocca e un secondo foglio lo racconta
import type { Types } from 'mongoose';
import { learnedSpellState } from 'src/characters/spells/spell-state.snapshot';
import { fromCopper } from 'src/economy/coins';
import type { KnowledgeAddition } from 'src/lore/knowledge-addition';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import type { QuestType } from 'src/models/enums/quest-type.enum';
import { idForms, refIdOf, sameId } from 'src/mongo/document-id';
import {
    lanePathOf,
    QuestLane,
    STANDARD_LANE_FREE,
} from 'src/quests/acceptance/quest-lanes';
import {
    NO_TURN_COUNTERS,
    type OutcomeCharacterSnapshot,
    type QuestResultDraft,
} from '../outcome-plan';
import { statusFactsOf } from '../progression/status-facts';
import type { SpellCandidate } from '../rewards/quest-rewards';
import { knowledgeUpdateOf } from '../victory-knowledge';

// ciò che il secondo foglio prende dal foglio della ricerca (Phase 24 D-31)
export interface ResearchSheet {
    user: Types.ObjectId;
    quest: QuestResultDraft['quest'];
}

export interface LearningEndInput {
    snapshot: OutcomeCharacterSnapshot;
    pendingQuestId: Types.ObjectId;
    spellId: Types.ObjectId;
    // la magia come sta a catalogo alla fine dell'apprendimento; null se non esiste più o non è più insegnabile
    spell: SpellCandidate | null;
    research: ResearchSheet | null;
    // id del secondo foglio, generato fuori dalla transazione (il callback è rieseguibile)
    resultId: Types.ObjectId;
    now: Date;
}

export interface LearningEndPlan {
    filter: Record<string, unknown>;
    update: {
        $set: Record<string, unknown>;
        $addToSet?: KnowledgeAddition['$addToSet'];
    };
    // il secondo foglio: solo se la magia è imparata qui e il foglio della ricerca è leggibile
    result: QuestResultDraft | null;
    learned: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

function questSnapshotOf(value: unknown): ResearchSheet['quest'] | null {
    if (!isRecord(value)) return null;
    const id = refIdOf(value.id);
    if (!id) return null;
    if (typeof value.type !== 'string') return null;
    if (typeof value.title !== 'string') return null;
    return { id, type: value.type as QuestType, title: value.title };
}

// foglio della ricerca riletto lean dal database: valido solo con utente e fotografia della quest leggibili
export function researchSheetOf(value: unknown): ResearchSheet | null {
    if (!isRecord(value)) return null;
    const user = refIdOf(value.user);
    const quest = questSnapshotOf(value.quest);
    if (!user || !quest) return null;
    return { user, quest };
}

function knowsSpell(
    snapshot: OutcomeCharacterSnapshot,
    spellId: Types.ObjectId,
): boolean {
    return (snapshot.status.spellStates ?? []).some((state) =>
        sameId(state.spell, spellId),
    );
}

function learnedSheetOf(
    input: LearningEndInput,
    research: ResearchSheet,
    loreUnlocked: Types.ObjectId[],
): QuestResultDraft {
    const facts = statusFactsOf(input.snapshot);
    return {
        _id: input.resultId,
        character: input.snapshot._id,
        user: research.user,
        quest: research.quest,
        outcome: QuestOutcome.success,
        resolvedAt: input.now,
        hpBefore: facts.currentLifePoints,
        hpAfter: facts.currentLifePoints,
        maxLifePoints: facts.maxLifePoints,
        injuriesAdded: [],
        injuriesHealed: [],
        consumablesUsed: [],
        spellsUsed: [],
        rewards: { coins: fromCopper(0), items: [], pet: null },
        xpGained: 0,
        petXpGained: 0,
        xpBefore: facts.xp,
        xpAfter: facts.xp,
        levelBefore: facts.level,
        levelAfter: facts.level,
        titleBefore: facts.title,
        titleAfter: facts.title,
        spellLearned: input.spellId,
        loreUnlocked,
        enemies: [],
        stagesCleared: null,
        stagesTotal: null,
        ...NO_TURN_COUNTERS,
        rescuedCharacters: [],
        arrested: false,
        coinsLost: null,
        guardEncounter: false,
        companion: null,
        spellFound: null,
        spellResearchFailed: false,
    };
}

export function planLearningEnd(input: LearningEndInput): LearningEndPlan {
    const { snapshot, spell, spellId } = input;
    const filter = {
        ...activeCharacterById(snapshot._id),
        [lanePathOf(QuestLane.standard)]: {
            $in: idForms(input.pendingQuestId),
        },
    };
    // magia sparita dal catalogo o già conosciuta: la corsia si libera in silenzio, nessun foglio vuoto
    if (!spell || knowsSpell(snapshot, spellId)) {
        return {
            filter,
            update: { $set: { ...STANDARD_LANE_FREE } },
            result: null,
            learned: false,
        };
    }
    const knowledge = knowledgeUpdateOf(
        snapshot.status.unlockedLore,
        spell.relatedLore ?? [],
    );
    return {
        filter,
        update: {
            $set: {
                ...STANDARD_LANE_FREE,
                'status.spellStates': [
                    ...(snapshot.status.spellStates ?? []),
                    learnedSpellState(spellId, spell.maxUsages),
                ],
            },
            ...knowledge.addition,
        },
        result: input.research
            ? learnedSheetOf(input, input.research, knowledge.fresh)
            : null,
        learned: true,
    };
}
