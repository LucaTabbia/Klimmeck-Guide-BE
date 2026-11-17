import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    ChannelAccessCheck,
    ChannelAccessCheckDocument,
} from 'src/auth/channel-access/channel-access-check.model';
import { ChannelAccess } from 'src/auth/channel-access/channel-access.enum';
import { StreamerAccessTokenProvider } from 'src/auth/channel-access/streamer-access-token.provider';
import { Clock } from 'src/auth/clock';
import { TwitchOAuthClient } from 'src/auth/twitch/twitch-oauth.client';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { AuthConfig } from 'src/config/auth-config';

const MILLISECONDS_PER_SECOND = 1000;

// l'accesso al gioco dipende dal canale (oggi il follow): riverificato al refresh della sessione, al più una volta per intervallo
@Injectable()
export class ChannelAccessService {
    private readonly logger = new Logger(ChannelAccessService.name);

    constructor(
        @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
        @InjectModel(ChannelAccessCheck.name)
        private readonly checks: Model<ChannelAccessCheckDocument>,
        private readonly streamerAccessToken: StreamerAccessTokenProvider,
        private readonly twitchOAuthClient: TwitchOAuthClient,
        private readonly clock: Clock,
    ) {}

    async recheck(twitchId: string): Promise<ChannelAccess> {
        const broadcasterId = this.config.twitch?.followGateBroadcasterId;
        if (!broadcasterId || twitchId === broadcasterId) {
            return ChannelAccess.granted;
        }
        const now = this.clock.now();
        if (!(await this.isDue(twitchId, now))) return ChannelAccess.granted;
        const access = await this.askTwitch(twitchId, broadcasterId);
        if (access === ChannelAccess.granted) {
            await this.markChecked(twitchId, now);
        }
        return access;
    }

    private async askTwitch(
        twitchId: string,
        broadcasterId: string,
    ): Promise<ChannelAccess> {
        try {
            const accessToken =
                await this.streamerAccessToken.get(broadcasterId);
            if (accessToken === null) return ChannelAccess.unknown;
            const follows = await this.twitchOAuthClient.channelHasFollower({
                accessToken,
                userId: twitchId,
                broadcasterId,
            });
            return follows ? ChannelAccess.granted : ChannelAccess.lost;
        } catch (failure) {
            // il token in cache potrebbe essere stato revocato: il prossimo controllo lo rinnova
            this.streamerAccessToken.invalidate();
            this.logger.warn(
                `Channel access re-check skipped: ${failure instanceof Error ? failure.name : 'unknown'}`,
            );
            return ChannelAccess.unknown;
        }
    }

    private async isDue(twitchId: string, now: Date): Promise<boolean> {
        const check = await this.checks
            .findOne({ twitchId }, { checkedAt: 1 })
            .lean<{ checkedAt: Date } | null>()
            .exec();
        if (!check) return true;
        const recheckMs =
            this.config.channelAccessRecheckSeconds * MILLISECONDS_PER_SECOND;
        return now.getTime() - check.checkedAt.getTime() >= recheckMs;
    }

    private async markChecked(twitchId: string, now: Date): Promise<void> {
        await this.checks
            .updateOne(
                { twitchId },
                { $set: { checkedAt: now } },
                { upsert: true },
            )
            .exec();
    }
}
