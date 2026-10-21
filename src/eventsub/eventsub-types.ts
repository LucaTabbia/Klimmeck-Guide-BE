export enum EventSubMessageType {
    verification = 'webhook_callback_verification',
    notification = 'notification',
    revocation = 'revocation',
}

export enum EventSubSubscriptionType {
    redemptionAdd = 'channel.channel_points_custom_reward_redemption.add',
    streamOnline = 'stream.online',
}

export const EVENTSUB_SUBSCRIPTION_VERSION = '1';

export const AUTHORIZATION_REVOKED_STATUS = 'authorization_revoked';

// rimedio di D-11, condiviso da revocation e reconcile
export const STREAMER_SCOPE_REMEDY =
    'the streamer must log in again with TWITCH_LOGIN_SCOPES=channel:read:redemptions';
