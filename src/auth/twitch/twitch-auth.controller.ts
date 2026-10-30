import {
    Controller,
    Get,
    HttpStatus,
    Query,
    Redirect,
    UseFilters,
} from '@nestjs/common';
import type { HttpRedirectResponse } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { TwitchLoginService } from 'src/auth/twitch/twitch-login.service';
import type { TwitchCallbackQuery } from 'src/auth/twitch/twitch-login.service';
import { OAuthRateLimitRedirectFilter } from 'src/throttling/oauth-rate-limit-redirect.filter';
import { Throttled } from 'src/throttling/throttled.decorator';

// @Public() solo sugli handler, mai sulla classe: la whitelist è verificata per handler (02-07)
@Controller('auth/twitch')
export class TwitchAuthController {
    constructor(private readonly twitchLoginService: TwitchLoginService) {}

    @Public()
    @Throttled()
    @UseFilters(OAuthRateLimitRedirectFilter)
    @Get('start')
    @Redirect()
    async start(
        @Query('challenge') challenge?: string,
    ): Promise<HttpRedirectResponse> {
        return {
            url: await this.twitchLoginService.buildStartRedirectUrl(challenge),
            statusCode: HttpStatus.FOUND,
        };
    }

    @Public()
    @Throttled()
    @UseFilters(OAuthRateLimitRedirectFilter)
    @Get('callback')
    @Redirect()
    async callback(
        @Query() query: TwitchCallbackQuery,
    ): Promise<HttpRedirectResponse> {
        return {
            url: await this.twitchLoginService.handleCallback(query),
            statusCode: HttpStatus.FOUND,
        };
    }
}
