import { HttpException } from '@nestjs/common';
import { PushErrorCode } from 'src/push/push-error-code.enum';
import { PushEventType } from 'src/push/push-event-type.enum';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushException } from 'src/push/push.exception';

describe('PushException', () => {
    it.each([
        [
            'invalidDeviceId',
            400,
            'Bad Request',
            PushErrorCode.PUSH_INVALID_DEVICE_ID,
            'Identificativo del dispositivo non valido',
            () => PushException.invalidDeviceId(),
        ],
        [
            'invalidToken',
            400,
            'Bad Request',
            PushErrorCode.PUSH_INVALID_TOKEN,
            'Token di notifica non valido',
            () => PushException.invalidToken(),
        ],
        [
            'disabled',
            503,
            'Service Unavailable',
            PushErrorCode.PUSH_DISABLED,
            'Notifiche push non configurate sul server',
            () => PushException.disabled(),
        ],
    ])(
        '%s is a %i %s with code %s and an italian message',
        (_factory, status, error, code, message, build) => {
            const exception = build();

            expect(exception).toBeInstanceOf(HttpException);
            expect(exception.getStatus()).toBe(status);
            expect(exception.code).toBe(code);
            expect(exception.extensions).toEqual({ code });
            expect(exception.getResponse()).toEqual({
                statusCode: status,
                error,
                message,
                code,
            });
            expect(exception.message).toBe(message);
        },
    );

    it('uses error codes whose values equal their names', () => {
        expect(Object.entries(PushErrorCode)).toEqual([
            ['PUSH_INVALID_DEVICE_ID', 'PUSH_INVALID_DEVICE_ID'],
            ['PUSH_INVALID_TOKEN', 'PUSH_INVALID_TOKEN'],
            ['PUSH_DISABLED', 'PUSH_DISABLED'],
        ]);
    });

    it('declares the GraphQL enums with camelCase values', () => {
        expect(Object.values(PushPlatform)).toEqual(['android', 'ios']);
        expect(Object.values(PushEventType)).toEqual([
            'travelEnd',
            'questEnd',
            'streamerLive',
        ]);
    });
});
