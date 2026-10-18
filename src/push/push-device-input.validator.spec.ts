import { RegisterPushDeviceInput } from 'src/push/dto/register-push-device.input';
import {
    assertValidDeviceId,
    validateRegisterPushDeviceInput,
} from 'src/push/push-device-input.validator';
import { PushErrorCode } from 'src/push/push-error-code.enum';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushException } from 'src/push/push.exception';

function expectPushError(action: () => void, code: PushErrorCode): void {
    let thrown: unknown;
    try {
        action();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeInstanceOf(PushException);
    expect((thrown as PushException).code).toBe(code);
}

function registration(
    overrides: Partial<RegisterPushDeviceInput> = {},
): RegisterPushDeviceInput {
    return {
        deviceId: 'device-1',
        token: 'f'.repeat(163) + ':APA91b',
        platform: PushPlatform.android,
        ...overrides,
    };
}

describe('assertValidDeviceId', () => {
    it.each([
        'a',
        'x'.repeat(128),
        '550e8400-e29b-41d4-a716-446655440000',
        'dev.ice_01-A',
    ])('accepts %p', (deviceId) => {
        expect(() => assertValidDeviceId(deviceId)).not.toThrow();
    });

    it.each([
        '',
        'x'.repeat(129),
        'with space',
        'emoji😀',
        'slash/id',
        'tab\tid',
        'new\nline',
        '$where',
    ])('rejects %p with PUSH_INVALID_DEVICE_ID', (deviceId) => {
        expectPushError(
            () => assertValidDeviceId(deviceId),
            PushErrorCode.PUSH_INVALID_DEVICE_ID,
        );
    });
});

describe('validateRegisterPushDeviceInput', () => {
    it('accepts a valid registration', () => {
        expect(() =>
            validateRegisterPushDeviceInput(registration()),
        ).not.toThrow();
    });

    it('accepts a token of exactly 4096 characters', () => {
        expect(() =>
            validateRegisterPushDeviceInput(
                registration({ token: 'x'.repeat(4096) }),
            ),
        ).not.toThrow();
    });

    it('rejects a token longer than 4096 characters', () => {
        expectPushError(
            () =>
                validateRegisterPushDeviceInput(
                    registration({ token: 'x'.repeat(4097) }),
                ),
            PushErrorCode.PUSH_INVALID_TOKEN,
        );
    });

    it.each(['', ' ', 'tok en', 'tok\nen', ' token', 'token\t'])(
        'rejects the token %p with PUSH_INVALID_TOKEN',
        (token) => {
            expectPushError(
                () => validateRegisterPushDeviceInput(registration({ token })),
                PushErrorCode.PUSH_INVALID_TOKEN,
            );
        },
    );

    it('checks the deviceId before the token', () => {
        expectPushError(
            () =>
                validateRegisterPushDeviceInput({
                    deviceId: '',
                    token: '',
                    platform: PushPlatform.ios,
                }),
            PushErrorCode.PUSH_INVALID_DEVICE_ID,
        );
    });
});
