import { ServerTimeResolver } from 'src/time/server-time.resolver';
import { FixedClock } from '../../test/auth/fixed-clock';

describe('ServerTimeResolver', () => {
    it('answers the current time of the clock', () => {
        const clock = new FixedClock(new Date('2026-10-21T10:08:31.784Z'));
        const resolver = new ServerTimeResolver(clock);

        const result = resolver.serverTime();

        expect(result).toBeInstanceOf(Date);
        expect(result).toEqual(new Date('2026-10-21T10:08:31.784Z'));
    });

    it('follows the clock as it advances', () => {
        const clock = new FixedClock(new Date('2026-10-21T10:08:31.784Z'));
        const resolver = new ServerTimeResolver(clock);

        clock.advanceSeconds(5);

        expect(resolver.serverTime()).toEqual(
            new Date('2026-10-21T10:08:36.784Z'),
        );
    });
});
