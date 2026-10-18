import { RegisterPushDeviceInput } from 'src/push/dto/register-push-device.input';
import { PushException } from 'src/push/push.exception';

export const DEVICE_ID_MAX_LENGTH = 128;
export const PUSH_TOKEN_MAX_LENGTH = 4096;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const WHITESPACE = /\s/;

// la validazione del client è solo UX: questa è quella autoritativa (ordine: deviceId, token)
export function validateRegisterPushDeviceInput(
    input: RegisterPushDeviceInput,
): void {
    assertValidDeviceId(input.deviceId);
    assertValidPushToken(input.token);
}

export function assertValidDeviceId(deviceId: string): void {
    if (
        deviceId.length === 0 ||
        deviceId.length > DEVICE_ID_MAX_LENGTH ||
        !DEVICE_ID_PATTERN.test(deviceId)
    ) {
        throw PushException.invalidDeviceId();
    }
}

function assertValidPushToken(token: string): void {
    if (
        token.length === 0 ||
        token.length > PUSH_TOKEN_MAX_LENGTH ||
        WHITESPACE.test(token)
    ) {
        throw PushException.invalidToken();
    }
}
