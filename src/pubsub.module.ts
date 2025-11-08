import { Global, Module } from '@nestjs/common';
import { createPubSub } from '@graphql-yoga/subscription';
import { Character } from 'src/models/character/character.model';

export type PubSubEvents = {
    characterUpdated: [character: Character];
};

@Global()
@Module({
    providers: [
        {
            provide: 'PUB_SUB',
            useValue: createPubSub<PubSubEvents>(),
        },
    ],
    exports: ['PUB_SUB'],
})
export class PubSubModule { }
