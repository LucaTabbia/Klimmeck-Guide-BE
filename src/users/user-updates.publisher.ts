import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/models/user.model';
import { documentIdOf } from 'src/mongo/document-id';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { UsersService } from 'src/users/users.service';

const USER_CHANGES_PIPELINE = [
    { $match: { operationType: { $in: ['update', 'replace'] } } },
];

// ogni scrittura su users (login, createCharacter, ruolo cambiato a mano, futuri accrediti EventSub) emette lo User completo:
// nessun publish sparso nei service (D-02); gli insert non servono, nessun subscriber esiste prima del primo token
@Injectable()
export class UserUpdatesPublisher implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(UserUpdatesPublisher.name);
    private changeStream?: ReturnType<Model<UserDocument>['watch']>;

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly usersService: UsersService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    onModuleInit(): void {
        this.changeStream = this.userModel.watch(USER_CHANGES_PIPELINE, {
            fullDocument: 'updateLookup',
        });
        this.changeStream.on(
            'change',
            (change: { fullDocument?: unknown }) =>
                void this.publishChange(change.fullDocument),
        );
        this.changeStream.on('error', (error: unknown) =>
            this.logger.error(
                'Errore nel change stream degli utenti',
                error instanceof Error ? error.message : error,
            ),
        );
    }

    async onModuleDestroy(): Promise<void> {
        await this.changeStream?.close();
    }

    private async publishChange(fullDocument: unknown): Promise<void> {
        const userId = documentIdOf(fullDocument);
        if (!userId) return;
        try {
            const userUpdated = await this.usersService.findOne(userId);
            this.pubSub.publish('userUpdated', { userUpdated });
        } catch (error) {
            this.logger.error(
                'Pubblicazione di userUpdated fallita',
                error instanceof Error ? error.message : error,
            );
        }
    }
}
