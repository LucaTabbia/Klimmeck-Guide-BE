// spese del tragitto verso una quest (Phase 26 D-13, D-26): cibo mangiato e vita persa per fame, rimborsati all'annullamento della quest
import type { ClientSession, Model, Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import { refIdOf } from 'src/mongo/document-id';
import type { FoodSettlement } from './travel-food-settlement';

export interface QuestTravelSpending {
    food: { item: Types.ObjectId; quantity: number }[];
    lifeLost: number;
}

// null = né cibo mangiato né vita persa; la vita dopo è già limitata al minimo
export function questTravelSpendingOf(
    settlement: FoodSettlement | null,
    lifeBefore: number,
): QuestTravelSpending | null {
    if (!settlement) return null;
    const food = settlement.consumed.map(({ itemId, quantity }) => ({
        item: itemId,
        quantity,
    }));
    const lifeLost =
        settlement.hpLoss > 0
            ? Math.max(0, lifeBefore - settlement.lifeAfter)
            : 0;
    return food.length > 0 || lifeLost > 0 ? { food, lifeLost } : null;
}

// solo le parti non vuote: righe aggiunte in coda, vita sommata
export function questTravelSpendingUpdateOf(
    spending: QuestTravelSpending,
): Record<string, unknown> {
    return {
        ...(spending.food.length > 0
            ? { $push: { travelFoodSpent: { $each: spending.food } } }
            : {}),
        ...(spending.lifeLost > 0
            ? { $inc: { travelHungerLifeLost: spending.lifeLost } }
            : {}),
    };
}

// nella transazione del pasto, solo per un viaggio verso una quest con la sua PendingQuest; una PendingQuest assente non è un errore (party sciolto)
export async function recordQuestTravelSpendingWithin(
    pendingQuestModel: Model<PendingQuestDocument>,
    travel: { kind?: unknown } | null | undefined,
    pendingQuestRef: unknown,
    spending: QuestTravelSpending | null,
    session: ClientSession,
): Promise<void> {
    if (travel?.kind !== TravelKind.quest || !spending) return;
    const pendingQuestId = refIdOf(pendingQuestRef);
    if (!pendingQuestId) return;
    await pendingQuestModel.updateOne(
        { _id: pendingQuestId },
        questTravelSpendingUpdateOf(spending),
        { session },
    );
}
