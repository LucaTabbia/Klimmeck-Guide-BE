import type { Types } from 'mongoose';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { idForms } from 'src/mongo/document-id';
import {
    type OutcomeCharacterSnapshot,
    type OutcomeQuestSnapshot,
    questFactsOf,
    type QuestResultDraft,
    statusFactsOf,
} from './outcome-plan';

export interface RescuedPlanInput {
    resultId: Types.ObjectId;
    snapshot: OutcomeCharacterSnapshot;
    aidQuest: OutcomeQuestSnapshot;
    userId: Types.ObjectId;
    cityMarker: Types.ObjectId | null;
    now: Date;
}

export interface RescuedPlan {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown> };
    result: QuestResultDraft;
}

export interface DeathResultInput {
    resultId: Types.ObjectId;
    snapshot: OutcomeCharacterSnapshot;
    quest: OutcomeQuestSnapshot;
    userId: Types.ObjectId;
    now: Date;
}

// foglio di un esito che non tocca il personaggio: valori prima = dopo, nessun premio
function unchangedResult(
    snapshot: OutcomeCharacterSnapshot,
    quest: OutcomeQuestSnapshot,
    userId: Types.ObjectId,
    outcome: QuestOutcome.rescued | QuestOutcome.death,
    resultId: Types.ObjectId,
    now: Date,
): QuestResultDraft {
    const status = statusFactsOf(snapshot);
    return {
        _id: resultId,
        character: snapshot._id,
        user: userId,
        quest: questFactsOf(quest),
        outcome,
        resolvedAt: now,
        hpBefore: status.currentLifePoints,
        hpAfter: status.currentLifePoints,
        maxLifePoints: status.maxLifePoints,
        injuriesAdded: [],
        consumablesUsed: [],
        spellsUsed: [],
        rewards: { coins: { gold: 0, silver: 0, copper: 0 }, items: [] },
        xpGained: 0,
        xpBefore: status.xp,
        xpAfter: status.xp,
        levelBefore: status.level,
        levelAfter: status.level,
        titleBefore: status.title,
        titleAfter: status.title,
        spellLearned: null,
        enemy: null,
        rescuedCharacter: null,
    };
}

// soccorso riuscito (D-09): liberato con gli HP che ha, riportato al marker della città, nessun viaggio né push di viaggio
export function planRescued(input: RescuedPlanInput): RescuedPlan {
    const { snapshot, aidQuest, cityMarker } = input;
    return {
        filter: {
            ...activeCharacterById(snapshot._id),
            'status.awaitingAid.aidQuest': { $in: idForms(aidQuest._id) },
        },
        update: {
            $set: {
                'status.awaitingAid': null,
                ...(cityMarker ? { 'status.location': cityMarker } : {}),
            },
        },
        result: unchangedResult(
            snapshot,
            aidQuest,
            input.userId,
            QuestOutcome.rescued,
            input.resultId,
            input.now,
        ),
    };
}

// morte (D-09, D-10): il risultato è dell'utente, letto prima dell'archivio; l'archivio lo fa CharacterArchiver (09-11) nella stessa transazione
export function deathResultOf(input: DeathResultInput): QuestResultDraft {
    return unchangedResult(
        input.snapshot,
        input.quest,
        input.userId,
        QuestOutcome.death,
        input.resultId,
        input.now,
    );
}
