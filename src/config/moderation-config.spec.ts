import {
    MODERATION_ENV_KEYS,
    parseModerationConfig,
    readModerationEnv,
} from 'src/config/moderation-config';

const USER_ID = 'fake-user';
const SECRET = 'fake-secret';

function messageOf(action: () => unknown): string {
    try {
        action();
    } catch (error) {
        return (error as Error).message;
    }
    throw new Error('expected the action to throw');
}

describe('parseModerationConfig', () => {
    it('enables moderation with both keys (D-14)', () => {
        expect(
            parseModerationConfig({
                NODE_ENV: 'production',
                SIGHTENGINE_USER_ID: USER_ID,
                SIGHTENGINE_API_SECRET: SECRET,
            }),
        ).toEqual({ sightengine: { userId: USER_ID, secret: SECRET } });
    });

    it('trims the Sightengine keys (D-14)', () => {
        expect(
            parseModerationConfig({
                SIGHTENGINE_USER_ID: ` ${USER_ID}\n`,
                SIGHTENGINE_API_SECRET: `\t${SECRET} `,
            }),
        ).toEqual({ sightengine: { userId: USER_ID, secret: SECRET } });
    });

    it.each([['development'], ['test'], [undefined]])(
        'disables moderation with both keys empty outside production (D-14) — NODE_ENV=%s',
        (mode) => {
            expect(
                parseModerationConfig({
                    NODE_ENV: mode,
                    SIGHTENGINE_USER_ID: '',
                    SIGHTENGINE_API_SECRET: '  ',
                }),
            ).toEqual({ sightengine: null });
        },
    );

    it('refuses to boot in production without the Sightengine keys (D-14)', () => {
        expect(
            messageOf(() => parseModerationConfig({ NODE_ENV: 'production' })),
        ).toEqual(
            'SIGHTENGINE_USER_ID and SIGHTENGINE_API_SECRET are required when NODE_ENV=production',
        );
    });

    it('refuses to boot without the Sightengine keys when NODE_ENV has surrounding whitespace (D-14)', () => {
        expect(
            messageOf(() =>
                parseModerationConfig({ NODE_ENV: ' production\n' }),
            ),
        ).toEqual(
            'SIGHTENGINE_USER_ID and SIGHTENGINE_API_SECRET are required when NODE_ENV=production',
        );
    });

    it.each([
        [USER_ID, ''],
        ['', SECRET],
    ])(
        'refuses a partial Sightengine configuration everywhere (D-14) — %j / %j',
        (userId, secret) => {
            for (const mode of ['development', 'test', 'production']) {
                expect(
                    messageOf(() =>
                        parseModerationConfig({
                            NODE_ENV: mode,
                            SIGHTENGINE_USER_ID: userId,
                            SIGHTENGINE_API_SECRET: secret,
                        }),
                    ),
                ).toEqual(
                    'SIGHTENGINE_USER_ID and SIGHTENGINE_API_SECRET must be set together',
                );
            }
        },
    );
});

describe('readModerationEnv', () => {
    it('reads only the moderation keys (D-14)', () => {
        expect(
            readModerationEnv({
                NODE_ENV: 'test',
                SIGHTENGINE_USER_ID: USER_ID,
                SIGHTENGINE_API_SECRET: SECRET,
                JWT_SECRET: 'fake-jwt',
            }),
        ).toEqual({
            NODE_ENV: 'test',
            SIGHTENGINE_USER_ID: USER_ID,
            SIGHTENGINE_API_SECRET: SECRET,
        });
    });

    it('declares the moderation keys (D-14)', () => {
        expect([...MODERATION_ENV_KEYS]).toEqual([
            'NODE_ENV',
            'SIGHTENGINE_USER_ID',
            'SIGHTENGINE_API_SECRET',
        ]);
    });
});
