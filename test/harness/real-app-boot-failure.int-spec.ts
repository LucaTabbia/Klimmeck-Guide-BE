import { SessionRevocationService } from 'src/auth/session/session-revocation.service';
import { bootRealApp, REAL_BOOT_TIMEOUT_MS } from './real-app-boot';

const FORCED_FAILURE = 'forced compile failure';

function failCompile(): never {
    throw new Error(FORCED_FAILURE);
}

// la spec deve terminare: un handle lasciato aperto dal boot fallito terrebbe jest appeso (trappola 15-03)
describe('bootRealApp failure', () => {
    it(
        'restores the environment and rethrows when the compile fails (C-IN-02)',
        async () => {
            const environmentBefore = { ...process.env };

            const outcome = await bootRealApp({
                dbName: 'real-app-boot-failure',
                configure: (builder) =>
                    builder
                        .overrideProvider(SessionRevocationService)
                        .useFactory({ factory: failCompile }),
            }).then(
                async (boot) => {
                    await boot.close();
                    return 'booted';
                },
                (error: Error) => error.message,
            );

            expect(outcome).toBe(FORCED_FAILURE);
            expect(process.env).toEqual(environmentBefore);
        },
        REAL_BOOT_TIMEOUT_MS,
    );
});
