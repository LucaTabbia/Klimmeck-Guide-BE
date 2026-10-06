import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { AuthSession } from 'src/auth/dto/auth-session.model';

@Resolver()
export class AuthResolver {
    constructor(private readonly authSessionService: AuthSessionService) {}

    @Public()
    @Mutation(() => AuthSession)
    exchangeLoginTicket(
        @Args('ticket') ticket: string,
        @Args('codeVerifier') codeVerifier: string,
    ): Promise<AuthSession> {
        return this.authSessionService.exchangeLoginTicket(
            ticket,
            codeVerifier,
        );
    }

    @Public()
    @Mutation(() => AuthSession)
    refreshSession(
        @Args('refreshToken') refreshToken: string,
    ): Promise<AuthSession> {
        return this.authSessionService.refresh(refreshToken);
    }
}
