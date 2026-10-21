export const LOOPBACK_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1'];

const LAST_C0_CONTROL_CODE_POINT = 0x1f;
const DELETE_CODE_POINT = 0x7f;

export function hasWhitespaceOrControlCharacter(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return (
            character.trim() === '' ||
            codePoint <= LAST_C0_CONTROL_CODE_POINT ||
            codePoint === DELETE_CODE_POINT
        );
    });
}

export function parseUrl(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}
