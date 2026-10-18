import { generateKeyPairSync } from 'node:crypto';
import { parsePushConfig, readPushEnv } from 'src/config/push-config';

const PROJECT_ID = 'klimmeck-test';
const CLIENT_EMAIL = 'push@klimmeck-test.iam.gserviceaccount.com';
const LEAK_MARKER = 'SECRETKEYMATERIAL';
const BASE64_LINE_WIDTH = 76;

function encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64');
}

function encodeRaw(text: string): string {
    return Buffer.from(text).toString('base64');
}

function wrapLines(encoded: string): string {
    return encoded
        .match(new RegExp(`.{1,${BASE64_LINE_WIDTH}}`, 'g'))!
        .join('\n');
}

function messageOf(action: () => unknown): string {
    try {
        action();
    } catch (error) {
        return (error as Error).message;
    }
    throw new Error('expected the action to throw');
}

describe('parsePushConfig', () => {
    let privateKey: string;
    let validAccount: Record<string, string>;

    beforeAll(() => {
        privateKey = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
        }).privateKey;
        validAccount = {
            type: 'service_account',
            project_id: PROJECT_ID,
            client_email: CLIENT_EMAIL,
            private_key: privateKey,
        };
    });

    function expectedConfig() {
        return {
            serviceAccount: {
                projectId: PROJECT_ID,
                clientEmail: CLIENT_EMAIL,
                privateKey,
            },
        };
    }

    function expectRejected(encoded: string, expectedMessage: string): string {
        const message = messageOf(() =>
            parsePushConfig({ FIREBASE_SERVICE_ACCOUNT: encoded }),
        );
        expect(message).toBe(expectedMessage);
        expect(message).not.toContain(encoded);
        return message;
    }

    describe('without the variable', () => {
        it.each([undefined, '', '   \n '])(
            'disables push outside production (value %p)',
            (value) => {
                for (const nodeEnv of ['development', 'test', undefined]) {
                    expect(
                        parsePushConfig({
                            NODE_ENV: nodeEnv,
                            FIREBASE_SERVICE_ACCOUNT: value,
                        }),
                    ).toEqual({ serviceAccount: null });
                }
            },
        );

        it('refuses to boot in production', () => {
            expect(() => parsePushConfig({ NODE_ENV: 'production' })).toThrow(
                'FIREBASE_SERVICE_ACCOUNT is required when NODE_ENV=production',
            );
        });
    });

    it('parses a valid base64 service account', () => {
        expect(
            parsePushConfig({
                NODE_ENV: 'production',
                FIREBASE_SERVICE_ACCOUNT: encode(validAccount),
            }),
        ).toEqual(expectedConfig());
    });

    it('accepts base64 wrapped at 76 columns', () => {
        expect(
            parsePushConfig({
                FIREBASE_SERVICE_ACCOUNT: wrapLines(encode(validAccount)),
            }),
        ).toEqual(expectedConfig());
    });

    it('rejects a value that is not base64', () => {
        expectRejected(
            'not base64 !!!',
            'FIREBASE_SERVICE_ACCOUNT must be the base64 encoding of the service account JSON',
        );
    });

    it('rejects truncated JSON without leaking its content', () => {
        const message = expectRejected(
            encodeRaw(`{"private_key": "${LEAK_MARKER}`),
            'FIREBASE_SERVICE_ACCOUNT does not decode to valid JSON',
        );

        expect(message).not.toContain(LEAK_MARKER);
    });

    it.each(['[1,2]', '42'])('rejects the non-object JSON %s', (json) => {
        expectRejected(
            encodeRaw(json),
            'FIREBASE_SERVICE_ACCOUNT does not decode to a JSON object',
        );
    });

    it.each(['project_id', 'client_email', 'private_key'])(
        'rejects a service account without "%s"',
        (field) => {
            const withoutField = { ...validAccount };
            delete withoutField[field];
            const expectedMessage = `FIREBASE_SERVICE_ACCOUNT is missing the "${field}" field`;

            expectRejected(encode(withoutField), expectedMessage);
            expectRejected(
                encode({ ...validAccount, [field]: '' }),
                expectedMessage,
            );
        },
    );

    it('rejects an invalid PEM without leaking the key', () => {
        const message = expectRejected(
            encode({
                ...validAccount,
                private_key: `-----BEGIN PRIVATE KEY-----\n${LEAK_MARKER}\n-----END PRIVATE KEY-----\n`,
            }),
            'FIREBASE_SERVICE_ACCOUNT private_key is not a valid PEM private key',
        );

        expect(message).not.toContain(LEAK_MARKER);
        expect(message).not.toContain('BEGIN');
    });
});

describe('readPushEnv', () => {
    it('keeps only the push keys', () => {
        expect(
            readPushEnv({
                NODE_ENV: 'production',
                FIREBASE_SERVICE_ACCOUNT: 'abc',
                JWT_SECRET: 'x',
            }),
        ).toEqual({ NODE_ENV: 'production', FIREBASE_SERVICE_ACCOUNT: 'abc' });
    });
});
