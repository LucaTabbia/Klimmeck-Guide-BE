import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { AuthSession } from 'src/auth/dto/auth-session.model';
import { User } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';

@Resolver()
export class AuthResolver {
    constructor(
        private readonly authSessionService: AuthSessionService,
        private readonly usersService: UsersService,
    ) {}

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

    @Query(() => User)
    me(@CurrentUser() identity: AuthIdentity): Promise<User> {
        return this.usersService.findOne(identity.userId);
    }

    @Mutation(() => Boolean)
    logout(@CurrentUser() identity: AuthIdentity): Promise<boolean> {
        return this.authSessionService.logout(identity);
    }
}
