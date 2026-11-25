import { Field, ObjectType } from '@nestjs/graphql';

// risposta della cancellazione dell'oste: il Twitch ID risolto conferma l'account tolto (Phase 26 D-20)
@ObjectType()
export class DeletedAccount {
    @Field(() => String)
    twitchId: string;
}
