import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsString } from 'class-validator';
import { PushPlatform } from 'src/push/push-platform.enum';

// solo forma: device e token restano PUSH_INVALID_* del validatore di dominio (C4)
@InputType()
export class RegisterPushDeviceInput {
    @Field(() => String)
    @IsString()
    deviceId: string;

    @Field(() => String)
    @IsString()
    token: string;

    @Field(() => PushPlatform)
    @IsEnum(PushPlatform)
    platform: PushPlatform;
}
