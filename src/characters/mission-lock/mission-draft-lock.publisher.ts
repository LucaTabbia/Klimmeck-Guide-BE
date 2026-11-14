import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf, idForms, objectIdFromHex } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { GM_LANES, lanePathOf } from 'src/quests/acceptance/quest-lanes';
import { CharacterUpdatesPublisher } from '../character-updates.publisher';

// avvio e scarto della bozza scrivono solo la PendingQuest (D-23): set a null, mai unset (RESEARCH sonda 3)
const MISSION_DRAFT_MARKS = {
    pipeline: [
        {
            $match: {
                operationType: 'update',
                'updateDescription.updatedFields.missionDraftStartedAt': {
                    $exists: true,
                },
            },
        },
    ],
    subject: 'degli avvii e degli scarti dei flussi guidati',
};

// gemello di PendingQuestStartPublisher sulle corsie del GM: i due campi risolti cambiano senza scritture sul personaggio (D-16, D-23)
@Injectable()
export class MissionDraftLockPublisher extends ChangeStreamPublisher<PendingQuestDocument> {
    constructor(
        @InjectModel(PendingQuest.name)
        pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly characterUpdates: CharacterUpdatesPublisher,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(pendingQuestModel, MISSION_DRAFT_MARKS, pubSub);
    }

    protected onChange(change: ChangeStreamEvent): void {
        const pendingQuestId = objectIdFromHex(
            documentIdOf(change.documentKey),
        );
        if (pendingQuestId) void this.republishHolders(pendingQuestId);
    }

    // ogni iscritto tiene la propria PendingQuest: si ripubblica chi la tiene su una corsia del GM; a chiusura iniziata niente letture
    private async republishHolders(
        pendingQuestId: Types.ObjectId,
    ): Promise<void> {
        if (this.stopping) return;
        try {
            const holders = await this.characterModel
                .find(
                    {
                        ...ACTIVE_CHARACTER_FILTER,
                        $or: GM_LANES.map((lane) => ({
                            [lanePathOf(lane)]: {
                                $in: idForms(pendingQuestId),
                            },
                        })),
                    },
                    { _id: 1 },
                )
                .lean<{ _id: Types.ObjectId }[]>()
                .exec();
            for (const { _id } of holders) {
                if (this.stopping) return;
                this.characterUpdates.requestPublish(String(_id));
            }
        } catch (error) {
            this.logger.error(
                `Ripubblicazione dei personaggi del flusso guidato ${pendingQuestId.toHexString()} fallita: ${describeError(error)}`,
            );
        }
    }
}
