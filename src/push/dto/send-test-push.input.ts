import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PushEventType } from 'src/push/push-event-type.enum';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

// tetto dei testi liberi degli input admin (D-04)
export const ADMIN_TEXT_MAX_LENGTH = 2000;

@InputType()
export class SendTestPushInput {
    @Field(() => PushEventType)
    @IsEnum(PushEventType)
    type: PushEventType;

    // default: il chiamante; ignorato per streamerLive
    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsObjectIdHex()
    targetUserId?: string | null;

    // finisce in data.id per travelEnd/questEnd
    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(ADMIN_TEXT_MAX_LENGTH)
    id?: string | null;
}
