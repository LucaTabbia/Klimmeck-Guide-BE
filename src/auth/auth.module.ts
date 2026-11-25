import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import { AuthResolver } from 'src/auth/auth.resolver';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { AuthStartupReporter } from 'src/auth/auth-startup.reporter';
import {
    ChannelAccessCheck,
    ChannelAccessCheckSchema,
} from 'src/auth/channel-access/channel-access-check.model';
import { ChannelAccessService } from 'src/auth/channel-access/channel-access.service';
import { StreamerAccessTokenProvider } from 'src/auth/channel-access/streamer-access-token.provider';
import {
    StreamerCredential,
    StreamerCredentialSchema,
} from 'src/auth/channel-access/streamer-credential.model';
import { StreamerCredentialStore } from 'src/auth/channel-access/streamer-credential.store';
import { Clock, SystemClock } from 'src/auth/clock';
import { DevAuthStrategy } from 'src/auth/dev/dev-auth.strategy';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import {
    LoginTicket,
    LoginTicketSchema,
} from 'src/auth/login-ticket/login-ticket.model';
import { LoginTicketService } from 'src/auth/login-ticket/login-ticket.service';
import { DeletedAccountRegistry } from 'src/auth/session/deleted-account.registry';
import { Session, SessionSchema } from 'src/auth/session/session.model';
import { SessionRevocationService } from 'src/auth/session/session-revocation.service';
import { SessionService } from 'src/auth/session/session.service';
import { UserRoleChangesPublisher } from 'src/auth/session/user-role-changes.publisher';
import { AccessTokenService } from 'src/auth/token/access-token.service';
import { HttpTwitchOAuthClient } from 'src/auth/twitch/http-twitch-oauth.client';
import { OAuthStateService } from 'src/auth/twitch/oauth-state.service';
import { TwitchAuthController } from 'src/auth/twitch/twitch-auth.controller';
import { TwitchLoginService } from 'src/auth/twitch/twitch-login.service';
import { TwitchOAuthClient } from 'src/auth/twitch/twitch-oauth.client';
import { WsConnectionAuthenticator } from 'src/auth/ws/ws-connection-authenticator';
import { WsSessionRegistry } from 'src/auth/ws/ws-session-registry';
import { AUTH_CONFIG, authConfigProvider } from 'src/config/auth-config';
import { User, UserSchema } from 'src/models/user.model';
import { UsersModule } from 'src/users/users.module';

// JwtModule senza secret: ogni servizio passa config.jwtSecret per chiamata (unica sorgente = AUTH_CONFIG)
@Module({
    imports: [
        JwtModule.register({}),
        UsersModule,
        MongooseModule.forFeature([
            { name: Session.name, schema: SessionSchema },
            { name: LoginTicket.name, schema: LoginTicketSchema },
            { name: User.name, schema: UserSchema },
            { name: StreamerCredential.name, schema: StreamerCredentialSchema },
            { name: ChannelAccessCheck.name, schema: ChannelAccessCheckSchema },
        ]),
    ],
    controllers: [TwitchAuthController],
    providers: [
        authConfigProvider,
        { provide: Clock, useClass: SystemClock },
        { provide: TwitchOAuthClient, useClass: HttpTwitchOAuthClient },
        AccessTokenService,
        OAuthStateService,
        SessionService,
        WsSessionRegistry,
        DeletedAccountRegistry,
        SessionRevocationService,
        UserRoleChangesPublisher,
        LoginTicketService,
        StreamerCredentialStore,
        StreamerAccessTokenProvider,
        ChannelAccessService,
        DevAuthStrategy,
        AuthIdentityResolver,
        WsConnectionAuthenticator,
        AuthStartupReporter,
        AuthSessionService,
        TwitchLoginService,
        AuthResolver,
        { provide: APP_GUARD, useClass: AuthGuard },
    ],
    exports: [
        AUTH_CONFIG,
        AuthIdentityResolver,
        WsConnectionAuthenticator,
        AuthSessionService,
        SessionRevocationService,
    ],
})
export class AuthModule {}
