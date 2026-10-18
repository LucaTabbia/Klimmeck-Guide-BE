import { Field, ID, InputType } from '@nestjs/graphql';
import { PushEventType } from 'src/push/push-event-type.enum';

@InputType()
export class SendTestPushInput {
    @Field(() => PushEventType)
    type: PushEventType;

    // default: il chiamante; ignorato per streamerLive
    @Field(() => ID, { nullable: true })
    targetUserId?: string | null;

    // finisce in data.id per travelEnd/questEnd
    @Field(() => String, { nullable: true })
    id?: string | null;
}
