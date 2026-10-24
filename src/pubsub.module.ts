import { Global, Module } from '@nestjs/common';
import { createPubSub } from '@graphql-yoga/subscription';
import { Character } from 'src/models/character/character.model';
import { PendingRequest } from 'src/models/pending-request.model';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { User } from 'src/models/user.model';

export const PUB_SUB = 'PUB_SUB';

// un solo PubSub in memoria (single instance, BE-FUT-02 fuori scope): ogni evento porta il documento completo
export type PubSubEvents = {
    characterUpdated: [payload: { characterUpdated: Character }];
    userUpdated: [payload: { userUpdated: User }];
    questResultReceived: [payload: { questResultReceived: QuestResult }];
    pendingRequestsUpdated: [
        payload: { pendingRequestsUpdated: PendingRequest[] },
    ];
};

@Global()
@Module({
    providers: [{ provide: PUB_SUB, useValue: createPubSub<PubSubEvents>() }],
    exports: [PUB_SUB],
})
export class PubSubModule {}
