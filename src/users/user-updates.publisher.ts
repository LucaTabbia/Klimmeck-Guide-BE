import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/models/user.model';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf } from 'src/mongo/document-id';
import { KeyedSingleFlight } from 'src/mongo/keyed-single-flight';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { UsersService } from 'src/users/users.service';

const USER_CHANGES = {
    pipeline: [{ $match: { operationType: { $in: ['update', 'replace'] } } }],
    options: { fullDocument: 'updateLookup' as const },
    subject: 'degli utenti',
};

// ogni scrittura su users (login, createCharacter, ruolo cambiato a mano, futuri accrediti EventSub) emette lo User completo:
// nessun publish sparso nei service (D-02); gli insert non servono, nessun subscriber esiste prima del primo token
@Injectable()
export class UserUpdatesPublisher extends ChangeStreamPublisher<UserDocument> {
    // una lettura alla volta per utente: l'ultimo evento di una raffica riflette lo stato più recente (WR-01)
    private readonly publishes = new KeyedSingleFlight((userId) =>
        this.publishOnce(userId),
    );

    constructor(
        @InjectModel(User.name) userModel: Model<UserDocument>,
        private readonly usersService: UsersService,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(userModel, USER_CHANGES, pubSub);
    }

    protected onChange(change: ChangeStreamEvent): void {
        const userId = documentIdOf(change.fullDocument);
        if (userId) this.publishes.request(userId);
    }

    private async publishOnce(userId: string): Promise<void> {
        if (this.stopping) return;
        try {
            const userUpdated = await this.usersService.findOne(userId);
            this.publish('userUpdated', { userUpdated });
        } catch (error) {
            this.logger.error(
                `Pubblicazione di userUpdated fallita: ${describeError(error)}`,
            );
        }
    }
}
