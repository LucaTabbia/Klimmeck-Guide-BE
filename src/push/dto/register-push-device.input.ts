import { Field, InputType } from '@nestjs/graphql';
import { PushPlatform } from 'src/push/push-platform.enum';

@InputType()
export class RegisterPushDeviceInput {
    @Field(() => String)
    deviceId: string;

    @Field(() => String)
    token: string;

    @Field(() => PushPlatform)
    platform: PushPlatform;
}
