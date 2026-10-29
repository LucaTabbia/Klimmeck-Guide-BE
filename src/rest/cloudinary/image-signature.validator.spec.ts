import {
    detectImageMimetype,
    ImageSignatureValidator,
} from 'src/rest/cloudinary/image-signature.validator';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function bufferOf(signature: number[] | string): Buffer {
    return typeof signature === 'string'
        ? Buffer.from(signature, 'latin1')
        : Buffer.from(signature);
}

function fileOf(buffer: Buffer | undefined, mimetype = 'image/jpeg') {
    return { mimetype, size: buffer?.length ?? 0, buffer };
}

describe('ImageSignatureValidator', () => {
    const validator = new ImageSignatureValidator({});

    it.each([
        ['jpeg', [0xff, 0xd8, 0xff, 0xe0], 'image/jpeg'],
        ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
        ['webp', 'RIFF....WEBP', 'image/webp'],
    ])(
        'recognises a %s image by its signature (C11)',
        (_name, signature, mimetype) => {
            const buffer = bufferOf(signature);

            expect(detectImageMimetype(buffer)).toBe(mimetype);
            expect(validator.isValid(fileOf(buffer))).toBe(true);
        },
    );

    it('rejects a text file renamed as an image (C11)', () => {
        const buffer = Buffer.from('<script>alert(1)</script>', 'utf8');

        expect(detectImageMimetype(buffer)).toBeNull();
        expect(validator.isValid(fileOf(buffer, 'image/png'))).toBe(false);
    });

    it('rejects a RIFF container that is not WEBP (C11)', () => {
        expect(detectImageMimetype(bufferOf('RIFF....WAVE'))).toBeNull();
    });

    it('ignores the declared mimetype (C11)', () => {
        expect(
            validator.isValid(fileOf(JPEG, 'application/octet-stream')),
        ).toBe(true);
    });

    it('rejects an empty or missing buffer (C11)', () => {
        expect(detectImageMimetype(Buffer.alloc(0))).toBeNull();
        expect(detectImageMimetype(undefined)).toBeNull();
        expect(validator.isValid(undefined)).toBe(false);
        expect(validator.isValid(fileOf(undefined))).toBe(false);
    });

    it('names only the file field in its error message (D-03)', () => {
        expect(validator.buildErrorMessage()).toBe('Input non valido: file');
    });
});
