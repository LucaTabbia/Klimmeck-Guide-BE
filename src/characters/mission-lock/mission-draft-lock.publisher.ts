import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { FilterQuery, Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { GM_LANES, lanePathOf } from 'src/quests/acceptance/quest-lanes';
import { CharacterUpdatesPublisher } from '../character-updates.publisher';
import { PendingQuestHoldersPublisher } from '../pending-quest-holders.publisher';

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

const gmLanesMatching = (
    condition: Record<string, unknown>,
): FilterQuery<CharacterDocument> => ({
    $or: GM_LANES.map((lane) => ({ [lanePathOf(lane)]: condition })),
});

// gemello di PendingQuestStartPublisher sulle corsie del GM: i due campi risolti cambiano senza scritture sul personaggio (D-16, D-23)
@Injectable()
export class MissionDraftLockPublisher extends PendingQuestHoldersPublisher {
    constructor(
        @InjectModel(PendingQuest.name)
        pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(Character.name)
        characterModel: Model<CharacterDocument>,
        characterUpdates: CharacterUpdatesPublisher,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(pendingQuestModel, characterModel, characterUpdates, pubSub, {
            stream: MISSION_DRAFT_MARKS,
            holding: gmLanesMatching,
            holders: 'del flusso guidato',
        });
    }

    // un avvio o uno scarto persi nel buco della storia: si ripubblica chiunque tenga una corsia del GM (D-23)
    protected onHistoryLost(): void {
        void this.republishHolders(
            gmLanesMatching({ $ne: null }),
            'dopo la storia persa',
        );
    }
}
