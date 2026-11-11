// UNA TANTUM (Phase 19 D-12): inserisce e rilegge col driver nativo le fixture nella forma vecchia (lo strict dei modelli scarterebbe i campi tolti) — esce dal repo dopo il boot reale
import type { Connection, Types } from 'mongoose';

type RawDocument = Record<string, unknown>;

export async function insertLegacy(
    connection: Connection,
    modelName: string,
    doc: RawDocument,
): Promise<Types.ObjectId> {
    const { insertedId } = await connection
        .model(modelName)
        .collection.insertOne(doc);
    return insertedId;
}

export async function rawById(
    connection: Connection,
    modelName: string,
    id: Types.ObjectId,
): Promise<RawDocument | null> {
    return connection.model(modelName).collection.findOne({ _id: id });
}
