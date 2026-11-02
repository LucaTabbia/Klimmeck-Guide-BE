import { AnyBulkWriteOperation, Document, ObjectId } from 'mongodb';

// upsert per _id (D-01): solo i campi del catalogo nel set, i campi runtime solo all'inserimento
export const upsertOp = (
    id: ObjectId,
    set: Document,
    onInsert: Document | null,
): AnyBulkWriteOperation => ({
    updateOne: {
        filter: { _id: id },
        update: { $set: set, ...(onInsert ? { $setOnInsert: onInsert } : {}) },
        upsert: true,
    },
});

// la geografia delle città non si tocca (D-23): solo il link alla lore, mai un inserimento
export const cityLoreOp = (
    cityId: ObjectId,
    relatedLore: ObjectId,
): AnyBulkWriteOperation => ({
    updateOne: {
        filter: { _id: cityId },
        update: { $set: { relatedLore } },
    },
});
