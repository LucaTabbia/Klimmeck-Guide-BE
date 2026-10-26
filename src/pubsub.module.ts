import { Global, Module } from '@nestjs/common';
import { createPubSub } from '@graphql-yoga/subscription';
import { Character } from 'src/models/character/character.model';
import { PendingRequest } from 'src/models/pending-request.model';
import { Quest } from 'src/models/quest/quest.model';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { User } from 'src/models/user.model';
import { SubscriberRegistry } from 'src/subscriber-registry';

export const PUB_SUB = 'PUB_SUB';

// un solo PubSub in memoria (single instance, BE-FUT-02 fuori scope): ogni evento porta il documento completo
export type PubSubEvents = {
    characterUpdated: [payload: { characterUpdated: Character }];
    userUpdated: [payload: { userUpdated: User }];
    questResultReceived: [payload: { questResultReceived: QuestResult }];
    pendingRequestsUpdated: [
        payload: { pendingRequestsUpdated: PendingRequest[] },
    ];
    // topic per quest (questUpdated:<id>): il publisher salta la rilettura quando nessuno ascolta quella quest
    questUpdated: [questId: string, payload: { questUpdated: Quest }];
};

const subscriberRegistry = new SubscriberRegistry();

@Global()
@Module({
    providers: [
        { provide: SubscriberRegistry, useValue: subscriberRegistry },
        {
            provide: PUB_SUB,
            useValue: createPubSub<PubSubEvents>({
                eventTarget: subscriberRegistry,
            }),
        },
    ],
    exports: [PUB_SUB, SubscriberRegistry],
})
export class PubSubModule {}
