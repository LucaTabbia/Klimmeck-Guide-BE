import request from 'supertest';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { createPlayer } from '../../../test/authz/player-fixture';

const FIVE_MIB = 5 * 1024 * 1024;
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const OCTET_STREAM = 'application/octet-stream';

function jpegOf(size: number): Buffer {
    const buffer = Buffer.alloc(size);
    Buffer.from(JPEG_HEADER).copy(buffer);
    return buffer;
}

function badUserInput(field: string) {
    return {
        statusCode: 400,
        error: 'Bad Request',
        code: 'BAD_USER_INPUT',
        message: `Input non valido: ${field}`,
    };
}

describe('CloudinaryController (wire)', () => {
    let harness: AuthTestApp;
    let productionHarness: AuthTestApp;
    let bearer: string;
    let productionBearer: string;

    beforeAll(async () => {
        harness = await createAuthTestApp();
        productionHarness = await createAuthTestApp({
            runtime: { mode: 'production', production: true },
        });
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-cloudinary',
            withCharacter: false,
        }));
        ({ bearer: productionBearer } = await createPlayer(productionHarness, {
            twitchId: 'twitch-cloudinary-production',
            withCharacter: false,
        }));
    });

    afterAll(async () => {
        await harness.close();
        await productionHarness.close();
    });

    beforeEach(() => {
        harness.cloudinary.uploadImage.mockClear();
        harness.cloudinary.listResources.mockClear();
    });

    const post = (target: AuthTestApp, path: string, auth = bearer) =>
        request(target.app.getHttpServer())
            .post(`/cloudinary/${path}`)
            .set({ Authorization: auth });

    it('uploads a JPEG sent as octet-stream (C11)', async () => {
        const response = await post(harness, 'uploadImage').attach(
            'file',
            jpegOf(64),
            { filename: 'portrait.jpg', contentType: OCTET_STREAM },
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ url: 'https://cdn.test/image.png' });
        expect(harness.cloudinary.uploadImage).toHaveBeenCalledTimes(1);
    });

    it('rejects a non-image upload with BAD_USER_INPUT (D-01)', async () => {
        const response = await post(harness, 'uploadImage').attach(
            'file',
            Buffer.from('<html>not an image</html>', 'utf8'),
            { filename: 'portrait.png', contentType: 'image/png' },
        );

        expect(response.status).toBe(400);
        expect(response.body).toEqual(badUserInput('file'));
        expect(harness.cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('rejects a missing file with BAD_USER_INPUT (D-01)', async () => {
        const response = await post(harness, 'uploadImage').field(
            'note',
            'no file',
        );

        expect(response.status).toBe(400);
        expect(response.body).toEqual(badUserInput('file'));
        expect(harness.cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('rejects an image over 5 MiB with 413 (D-01)', async () => {
        const response = await post(harness, 'uploadImage').attach(
            'file',
            jpegOf(FIVE_MIB + 1),
            { filename: 'portrait.jpg', contentType: OCTET_STREAM },
        );

        expect(response.status).toBe(413);
        expect(harness.cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('rejects two files with 400 (D-01)', async () => {
        const response = await post(harness, 'uploadImage')
            .attach('file', jpegOf(64), {
                filename: 'first.jpg',
                contentType: OCTET_STREAM,
            })
            .attach('file', jpegOf(64), {
                filename: 'second.jpg',
                contentType: OCTET_STREAM,
            });

        expect(response.status).toBe(400);
        expect(harness.cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('answers a Cloudinary failure with a coded 500 and no provider text in production (D-07)', async () => {
        productionHarness.cloudinary.uploadImage.mockRejectedValueOnce(
            new Error('Invalid api_key fake-key'),
        );

        const response = await post(
            productionHarness,
            'uploadImage',
            productionBearer,
        ).attach('file', jpegOf(64), {
            filename: 'portrait.jpg',
            contentType: OCTET_STREAM,
        });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Errore interno',
            requestId: expect.any(String),
        });
    });

    it('answers a Cloudinary list failure without provider text outside production (D-07)', async () => {
        harness.cloudinary.listSubfoldersResources.mockRejectedValueOnce(
            new Error('Invalid api_key fake-key'),
        );

        const response = await post(harness, 'getSubfoldersUrls').send({
            folder: 'main',
        });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            statusCode: 500,
            message: 'Internal server error',
        });
    });

    it('validates the folder of the image lists (D-01)', async () => {
        const valid = await post(harness, 'getUrls').send({ folder: 'main' });
        const traversal = await post(harness, 'getUrls').send({
            folder: '../x y',
        });
        const missing = await post(harness, 'getSubfoldersUrls').send({});

        expect(valid.status).toBe(201);
        expect(valid.body).toEqual({ urls: [] });
        expect(traversal.status).toBe(400);
        expect(traversal.body).toEqual(badUserInput('folder'));
        expect(missing.status).toBe(400);
        expect(missing.body).toEqual(badUserInput('folder'));
        expect(harness.cloudinary.listResources).toHaveBeenCalledTimes(1);
    });
});
