import {
    portraitPublicIdOf,
    portraitReferencePatternOf,
} from './portrait-public-id';

const CLOUD_NAME = 'demo-cloud';
const UPLOAD_BASE = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

describe('portraitPublicIdOf', () => {
    it('reads the public id of a portrait uploaded by the app (portrait default)', () => {
        expect(
            portraitPublicIdOf(
                `${UPLOAD_BASE}/v1731000000/characters_profile/abc_DEF-123.jpg`,
                CLOUD_NAME,
            ),
        ).toBe('characters_profile/abc_DEF-123');
        expect(
            portraitPublicIdOf(
                `${UPLOAD_BASE}/characters_profile/x9yz.png`,
                CLOUD_NAME,
            ),
        ).toBe('characters_profile/x9yz');
        expect(
            portraitPublicIdOf(
                `${UPLOAD_BASE}/v42/characters_profile/portrait.webp`,
                CLOUD_NAME,
            ),
        ).toBe('characters_profile/portrait');
    });

    it('refuses every image that is not an uploaded portrait (portrait default)', () => {
        const refused: unknown[] = [
            `${UPLOAD_BASE}/v1/presets/abc.jpg`,
            `${UPLOAD_BASE}/v1/characters_profile/sub/abc.jpg`,
            'https://evil.example.com/demo-cloud/image/upload/v1/characters_profile/abc.jpg',
            'https://res.cloudinary.com.evil.example.com/demo-cloud/image/upload/v1/characters_profile/abc.jpg',
            'http://res.cloudinary.com/demo-cloud/image/upload/v1/characters_profile/abc.jpg',
            `${UPLOAD_BASE}/v1/presets/../characters_profile/abc.jpg`,
            `${UPLOAD_BASE}/v1/characters_profile/../presets/abc.jpg`,
            `${UPLOAD_BASE}/v1/presets/%2e%2e/characters_profile/abc.jpg`,
            `${UPLOAD_BASE}/v1/characters_profile/abc.jpg?x=1`,
            `${UPLOAD_BASE}/v1/characters_profile/abc.jpg#frag`,
            `${UPLOAD_BASE}/v1/characters_profile/abc`,
            'https://res.cloudinary.com/demo-cloud/video/upload/v1/characters_profile/abc.mp4',
            '',
            null,
            undefined,
            42,
        ];

        for (const imagePath of refused) {
            expect(portraitPublicIdOf(imagePath, CLOUD_NAME)).toBeNull();
        }
    });

    it('refuses a portrait uploaded to another cloud (CR-01)', () => {
        expect(
            portraitPublicIdOf(
                'https://res.cloudinary.com/any-other/image/upload/v1/characters_profile/abc.jpg',
                CLOUD_NAME,
            ),
        ).toBeNull();
    });

    it('refuses every portrait when no cloud is configured (CR-01)', () => {
        expect(
            portraitPublicIdOf(
                `${UPLOAD_BASE}/v1/characters_profile/abc.jpg`,
                null,
            ),
        ).toBeNull();
    });
});

describe('portraitReferencePatternOf', () => {
    it('recognises every spelling of the same public id (CR-01)', () => {
        const pattern = portraitReferencePatternOf(['characters_profile/abc']);

        for (const spelling of [
            `${UPLOAD_BASE}/v1/characters_profile/abc.jpg`,
            `${UPLOAD_BASE}/characters_profile/abc.png`,
            `${UPLOAD_BASE}/c_fill,w_200/v3/characters_profile/abc.webp`,
            'https://res.cloudinary.com/any-other/image/upload/characters_profile/abc',
            `http://res.cloudinary.com/${CLOUD_NAME}/image/upload/characters_profile/abc.jpg?x=1`,
        ]) {
            expect(pattern.test(spelling)).toBe(true);
        }
    });

    it('does not mistake another public id for it (CR-01)', () => {
        const pattern = portraitReferencePatternOf(['characters_profile/abc']);

        for (const other of [
            `${UPLOAD_BASE}/v1/characters_profile/abc-2.jpg`,
            `${UPLOAD_BASE}/v1/characters_profile/xabc.jpg`,
            `${UPLOAD_BASE}/v1/other_characters_profile/abc.jpg`,
            `${UPLOAD_BASE}/v1/presets/abc.jpg`,
        ]) {
            expect(pattern.test(other)).toBe(false);
        }
    });
});
