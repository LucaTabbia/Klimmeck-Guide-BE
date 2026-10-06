import type { TwitchLoginErrorCode } from 'src/auth/twitch/twitch-login-error-code.enum';

// la base arriva solo da config.appAuthRedirectUrl (validata al boot), mai dalla request: niente open redirect
export function buildAppTicketRedirect(
    appAuthRedirectUrl: string,
    ticket: string,
): string {
    return withQuery(appAuthRedirectUrl, 'ticket', ticket);
}

export function buildAppErrorRedirect(
    appAuthRedirectUrl: string,
    error: TwitchLoginErrorCode,
): string {
    return withQuery(appAuthRedirectUrl, 'error', error);
}

function withQuery(base: string, key: string, value: string): string {
    const url = new URL(base);
    url.searchParams.set(key, value);
    return url.toString();
}
