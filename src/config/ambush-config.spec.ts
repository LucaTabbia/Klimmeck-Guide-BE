import { parseAmbushConfig, readAmbushEnv } from 'src/config/ambush-config';

describe('ambush config', () => {
    it('defaults the ambush time zone to Europe/Rome when empty (D-04)', () => {
        expect(parseAmbushConfig({})).toEqual({ timeZone: 'Europe/Rome' });
        expect(parseAmbushConfig({ AMBUSH_TIMEZONE: '   ' })).toEqual({
            timeZone: 'Europe/Rome',
        });
    });

    it('stores the canonical IANA name of the ambush time zone (D-04)', () => {
        expect(parseAmbushConfig({ AMBUSH_TIMEZONE: 'europe/rome' })).toEqual({
            timeZone: 'Europe/Rome',
        });
        expect(parseAmbushConfig({ AMBUSH_TIMEZONE: 'UTC' })).toEqual({
            timeZone: 'UTC',
        });
    });

    it('rejects an unknown time zone without echoing the value (D-04)', () => {
        let message = '';
        try {
            parseAmbushConfig({ AMBUSH_TIMEZONE: 'Mars/Base' });
        } catch (error) {
            message = (error as Error).message;
        }

        expect(message).toContain('AMBUSH_TIMEZONE');
        expect(message).not.toContain('Mars');
    });

    it('reads only the ambush keys from the source (D-04)', () => {
        expect(readAmbushEnv({ AMBUSH_TIMEZONE: 'UTC', OTHER: 'x' })).toEqual({
            AMBUSH_TIMEZONE: 'UTC',
        });
    });
});
