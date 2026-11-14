import type { PubSub } from '@graphql-yoga/subscription';
import { FilterQuery, Model, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import type { CharacterDocument } from 'src/models/character/character.model';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
    type ChangeStreamSpec,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf, idForms, objectIdFromHex } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import type { PubSubEvents } from 'src/pubsub.module';
import type { CharacterUpdatesPublisher } from './character-updates.publisher';

export interface PendingQuestHoldersSpec {
    stream: ChangeStreamSpec;
    // le corsie in cui un personaggio tiene la PendingQuest osservata
    holding(condition: Record<string, unknown>): FilterQuery<CharacterDocument>;
    // complemento dei personaggi nei log («della missione in attesa»)
    holders: string;
}

// una scrittura sulla sola PendingQuest cambia i campi risolti del personaggio: si ripubblica chi la tiene (D-22, D-23)
export abstract class PendingQuestHoldersPublisher extends ChangeStreamPublisher<PendingQuestDocument> {
    protected constructor(
        pendingQuestModel: Model<PendingQuestDocument>,
        private readonly characterModel: Model<CharacterDocument>,
        private readonly characterUpdates: CharacterUpdatesPublisher,
        pubSub: PubSub<PubSubEvents>,
        private readonly holders: PendingQuestHoldersSpec,
    ) {
        super(pendingQuestModel, holders.stream, pubSub);
    }

    protected onChange(change: ChangeStreamEvent): void {
        const pendingQuestId = objectIdFromHex(
            documentIdOf(change.documentKey),
        );
        if (pendingQuestId)
            void this.republishHolders(
                this.holders.holding({ $in: idForms(pendingQuestId) }),
                pendingQuestId.toHexString(),
            );
    }

    // a chiusura iniziata non si legge né si ripubblica (la connessione sta per chiudersi)
    protected async republishHolders(
        lanes: FilterQuery<CharacterDocument>,
        label: string,
    ): Promise<void> {
        if (this.stopping) return;
        try {
            const holders = await this.characterModel
                .find({ ...ACTIVE_CHARACTER_FILTER, ...lanes }, { _id: 1 })
                .lean<{ _id: Types.ObjectId }[]>()
                .exec();
            for (const { _id } of holders) {
                if (this.stopping) return;
                this.characterUpdates.requestPublish(String(_id));
            }
        } catch (error) {
            this.logger.error(
                `Ripubblicazione dei personaggi ${this.holders.holders} ${label} fallita: ${describeError(error)}`,
            );
        }
    }
}
