import { Field, InputType } from '@nestjs/graphql';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

// abbandono durante l'attesa del gruppo (utente 2026-10-25): stessa forma di AcceptQuestRequest
@InputType()
export class AbandonQuestRequest {
    @Field(() => String)
    @IsObjectIdHex()
    id: string;

    @Field(() => String)
    @IsObjectIdHex()
    questId: string;
}
