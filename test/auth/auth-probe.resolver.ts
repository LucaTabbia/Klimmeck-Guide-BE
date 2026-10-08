import { Query, Resolver, Subscription } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

// sonda solo-test: mai registrata in src; espone l'identità vista dal guard su HTTP e WS
@Resolver()
export class AuthProbeResolver {
    @Query(() => String)
    whoAmI(@CurrentUser() identity: AuthIdentity): string {
        return identity.twitchId;
    }

    @Subscription(() => String)
    authProbe(
        @CurrentUser() identity: AuthIdentity,
    ): AsyncIterator<{ authProbe: string }> {
        return (async function* () {
            await Promise.resolve();
            yield { authProbe: identity.twitchId };
        })();
    }
}
