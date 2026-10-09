import { Module } from '@nestjs/common';
import { AuthTestApp, createAuthTestApp } from './auth-test-app';

const HARNESS_PROBE = 'HARNESS_PROBE';

@Module({
    providers: [{ provide: HARNESS_PROBE, useValue: 'original' }],
    exports: [HARNESS_PROBE],
})
class HarnessProbeModule {}

describe('createAuthTestApp options', () => {
    let harness: AuthTestApp | undefined;

    afterEach(async () => {
        await harness?.close();
        harness = undefined;
    });

    it('mounts the feature modules passed via imports', async () => {
        harness = await createAuthTestApp({ imports: [HarnessProbeModule] });

        expect(harness.app.get(HARNESS_PROBE, { strict: false })).toBe(
            'original',
        );
    });

    it('replaces a provider passed via overrides', async () => {
        harness = await createAuthTestApp({
            imports: [HarnessProbeModule],
            overrides: [{ token: HARNESS_PROBE, useValue: 'overridden' }],
        });

        expect(harness.app.get(HARNESS_PROBE, { strict: false })).toBe(
            'overridden',
        );
    });

    it('does not mount feature modules by default', async () => {
        const defaultHarness = await createAuthTestApp();
        harness = defaultHarness;

        expect(() =>
            defaultHarness.app.get(HARNESS_PROBE, { strict: false }),
        ).toThrow();
    });
});
