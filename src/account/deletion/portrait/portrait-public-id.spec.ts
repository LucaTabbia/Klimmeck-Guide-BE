import { portraitPublicIdOf } from './portrait-public-id';

const UPLOAD_BASE = 'https://res.cloudinary.com/demo-cloud/image/upload';

describe('portraitPublicIdOf', () => {
    it('reads the public id of a portrait uploaded by the app (portrait default)', () => {
        expect(
            portraitPublicIdOf(
                `${UPLOAD_BASE}/v1731000000/characters_profile/abc_DEF-123.jpg`,
            ),
        ).toBe('characters_profile/abc_DEF-123');
        expect(
            portraitPublicIdOf(`${UPLOAD_BASE}/characters_profile/x9yz.png`),
        ).toBe('characters_profile/x9yz');
        expect(
            portraitPublicIdOf(
                `${UPLOAD_BASE}/v42/characters_profile/portrait.webp`,
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
            expect(portraitPublicIdOf(imagePath)).toBeNull();
        }
    });
});
