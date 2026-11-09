import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/models/user.model';
import {
    ChangeStreamPublisher,
    type ChangeStreamEvent,
    type ChangeStreamSpec,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { SessionRevocationService } from './session-revocation.service';

const MILLISECONDS_PER_SECOND = 1000;

// il cambio del ruolo revoca ogni sessione dell'utente (Phase 17 D-06): chiude T-10-19 oltre la finestra del JWT;
// vive in AuthModule perché UsersModule non può dipendere da AuthModule (C-3); upsertWithRole passa da qui attraverso il change stream (C-4);
// il ruolo stantio perso a BE spento resta coperto dalla rilettura al refresh (D-10)
export const USER_ROLE_CHANGES: ChangeStreamSpec = {
    pipeline: [
        {
            $match: {
                operationType: 'update',
                'updateDescription.updatedFields.role': { $exists: true },
            },
        },
    ],
    subject: 'dei ruoli degli utenti',
};

@Injectable()
export class UserRoleChangesPublisher extends ChangeStreamPublisher<UserDocument> {
    constructor(
        @InjectModel(User.name) userModel: Model<UserDocument>,
        private readonly revocation: SessionRevocationService,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(userModel, USER_ROLE_CHANGES, pubSub);
    }

    // un rifiuto non gestito abbatterebbe il processo; il log porta solo l'id e nome/codice dell'errore, mai il messaggio
    protected onChange(change: ChangeStreamEvent): void {
        const userId = documentIdOf(change.documentKey);
        if (!userId) return;
        this.revocation
            .revokeAllForRoleChange(userId, {
                createdBefore: endOfEventSecond(change),
            })
            .catch((error: unknown) =>
                this.logger.error(
                    `Revoca delle sessioni per cambio ruolo fallita per l'utente ${userId}: ${describeError(error)}`,
                ),
            );
    }
}

// clusterTime ha la risoluzione del secondo: il limite è la fine di quel secondo, quindi un login nello stesso secondo resta revocato
function endOfEventSecond({
    clusterTime,
}: ChangeStreamEvent): Date | undefined {
    if (!clusterTime) return undefined;
    return new Date((clusterTime.getHighBits() + 1) * MILLISECONDS_PER_SECOND);
}
