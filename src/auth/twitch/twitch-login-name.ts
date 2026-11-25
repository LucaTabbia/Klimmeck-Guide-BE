export const TWITCH_LOGIN_MAX_RAW_LENGTH = 64;

const TWITCH_LOGIN_PATTERN = /^[A-Za-z0-9_]{1,25}$/;
const LEADING_AT_SIGN = /^@/;

// nome utente Twitch dalle email delle pagine legali (Phase 26 D-15): null = non è un nome possibile
// la forma si controlla prima del minuscolo: un carattere non ASCII che diventa ASCII resta fuori
export function normalizedTwitchLoginOf(raw: string): string | null {
    if (raw.length > TWITCH_LOGIN_MAX_RAW_LENGTH) return null;
    const login = raw.trim().replace(LEADING_AT_SIGN, '');
    if (!TWITCH_LOGIN_PATTERN.test(login)) return null;
    return login.toLowerCase();
}
