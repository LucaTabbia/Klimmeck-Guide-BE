import type { Model, Types } from 'mongoose';
import type { UserDocument } from 'src/models/user.model';
import { idForms, refIdOf } from './document-id';

// proprietario = utente che punta al personaggio; un personaggio senza utente resta fuori dalla mappa (funzione pura sul modello: nessun modulo Nest da importare)
export async function ownersOf(
    userModel: Model<UserDocument>,
    characterIds: readonly Types.ObjectId[],
): Promise<Map<string, Types.ObjectId>> {
    const users = await userModel
        .find(
            {
                currentCharacter: {
                    $in: characterIds.flatMap((id) => idForms(id)),
                },
            },
            { _id: 1, currentCharacter: 1 },
        )
        .lean<{ _id: Types.ObjectId; currentCharacter: unknown }[]>()
        .exec();
    return new Map(
        users.flatMap(({ _id, currentCharacter }) => {
            const characterId = refIdOf(currentCharacter);
            return characterId
                ? [[characterId.toHexString(), _id] as const]
                : [];
        }),
    );
}
