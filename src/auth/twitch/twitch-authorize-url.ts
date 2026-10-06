import type { TwitchOAuthConfig } from 'src/config/auth-config';

export const TWITCH_AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';

// scope sempre presente e vuoto: al BE serve solo l'identità Twitch
export function buildTwitchAuthorizeUrl(
    twitch: TwitchOAuthConfig,
    state: string,
): string {
    const url = new URL(TWITCH_AUTHORIZE_URL);
    url.search = new URLSearchParams({
        response_type: 'code',
        client_id: twitch.clientId,
        redirect_uri: twitch.redirectUri,
        scope: '',
        force_verify: 'true',
        state,
    }).toString();
    return url.toString();
}
