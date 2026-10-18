import { registerEnumType } from '@nestjs/graphql';

export enum PushPlatform {
    android = 'android',
    ios = 'ios',
}

registerEnumType(PushPlatform, { name: 'PushPlatform' });
