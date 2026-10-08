import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthIdentityResolver } from 'src/auth/auth-identity.resolver';
import { AuthResolver } from 'src/auth/auth.resolver';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { AuthStartupReporter } from 'src/auth/auth-startup.reporter';
import { Clock, SystemClock } from 'src/auth/clock';
import { DevAuthStrategy } from 'src/auth/dev/dev-auth.strategy';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import {
    LoginTicket,
    LoginTicketSchema,
} from 'src/auth/login-ticket/login-ticket.model';
import { LoginTicketService } from 'src/auth/login-ticket/login-ticket.service';
import { Session, SessionSchema } from 'src/auth/session/session.model';
import { SessionService } from 'src/auth/session/session.service';
import { AccessTokenService } from 'src/auth/token/access-token.service';
import { HttpTwitchOAuthClient } from 'src/auth/twitch/http-twitch-oauth.client';
import { OAuthStateService } from 'src/auth/twitch/oauth-state.service';
import { TwitchAuthController } from 'src/auth/twitch/twitch-auth.controller';
import { TwitchLoginService } from 'src/auth/twitch/twitch-login.service';
import { TwitchOAuthClient } from 'src/auth/twitch/twitch-oauth.client';
import { WsConnectionAuthenticator } from 'src/auth/ws/ws-connection-authenticator';
import { AUTH_CONFIG, authConfigProvider } from 'src/config/auth-config';
import { UsersModule } from 'src/users/users.module';

// JwtModule senza secret: ogni servizio passa config.jwtSecret per chiamata (unica sorgente = AUTH_CONFIG)
@Module({
    imports: [
        JwtModule.register({}),
        UsersModule,
        MongooseModule.forFeature([
            { name: Session.name, schema: SessionSchema },
            { name: LoginTicket.name, schema: LoginTicketSchema },
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
        LoginTicketService,
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
    ],
})
export class AuthModule {}
