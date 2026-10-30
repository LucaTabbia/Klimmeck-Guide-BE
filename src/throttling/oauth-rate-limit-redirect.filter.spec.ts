import type { ArgumentsHost } from '@nestjs/common';
import { buildTestAuthConfig } from '../../test/auth/test-auth-config';
import { OAuthRateLimitRedirectFilter } from 'src/throttling/oauth-rate-limit-redirect.filter';
import { TooManyRequestsException } from 'src/throttling/too-many-requests.exception';

function httpHostWith(response: { redirect: jest.Mock }): ArgumentsHost {
    return {
        switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
}

describe('OAuthRateLimitRedirectFilter', () => {
    it('redirects a throttled OAuth navigation back to the app with rate_limited (C6)', () => {
        const response = { redirect: jest.fn() };
        const filter = new OAuthRateLimitRedirectFilter(
            buildTestAuthConfig({ appAuthRedirectUrl: 'klimmeck://auth' }),
        );

        filter.catch(new TooManyRequestsException(), httpHostWith(response));

        expect(response.redirect).toHaveBeenCalledWith(
            302,
            'klimmeck://auth?error=rate_limited',
        );
    });
});
