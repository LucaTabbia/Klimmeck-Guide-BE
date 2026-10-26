import { Field, InputType } from '@nestjs/graphql';

// abbandono durante l'attesa del gruppo (utente 2026-10-25): stessa forma di AcceptQuestRequest
@InputType()
export class AbandonQuestRequest {
    @Field(() => String)
    id: string;

    @Field(() => String)
    questId: string;
}
