import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SECRET_KEY_PATTERN =
    /(SECRET|_KEY|TOKEN|SERVICE_ACCOUNT|SIGHTENGINE_USER_ID)$/;
const TEMPLATE_LINE = /^([A-Z][A-Z0-9_]*)=(.*)$/gm;

function readTemplateSecrets(): Record<string, string> {
    const template = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    const secrets: Record<string, string> = {};
    for (const [, key, value] of template.matchAll(TEMPLATE_LINE)) {
        if (SECRET_KEY_PATTERN.test(key)) secrets[key] = value;
    }
    return secrets;
}

describe('.env.example secret keys', () => {
    it('keeps every secret key of the template empty (D-09)', () => {
        const secrets = readTemplateSecrets();
        const emptied = Object.fromEntries(
            Object.keys(secrets).map((key) => [key, '']),
        );

        expect(secrets).toEqual(emptied);
    });

    it('recognises the secret keys of the template (D-09)', () => {
        expect(Object.keys(readTemplateSecrets()).sort()).toEqual([
            'CLOUDINARY_API_KEY',
            'CLOUDINARY_API_SECRET',
            'DEV_AUTH_ACCESS_TOKEN',
            'FIREBASE_SERVICE_ACCOUNT',
            'JWT_SECRET',
            'SIGHTENGINE_API_SECRET',
            'SIGHTENGINE_USER_ID',
            'TWITCH_CLIENT_SECRET',
            'TWITCH_EVENTSUB_SECRET',
        ]);
    });
});
