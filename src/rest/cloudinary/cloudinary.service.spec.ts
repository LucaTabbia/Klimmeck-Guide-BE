import type { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { describeError } from 'src/mongo/mongo-errors';
import { CloudinaryService } from './cloudinary.service';

const PORTRAIT = {
    buffer: Buffer.from([0xff, 0xd8, 0xff]),
} as Express.Multer.File;
const PROVIDER_MESSAGE = 'Invalid api_key fake-key';
const PORTRAIT_PUBLIC_ID = 'characters_profile/abc_DEF-123';

function service(): CloudinaryService {
    return new CloudinaryService({
        get: () => undefined,
    } as unknown as ConfigService);
}

async function rejectionOf(work: Promise<unknown>): Promise<unknown> {
    try {
        await work;
    } catch (error) {
        return error;
    }
    throw new Error('expected a rejection');
}

describe('CloudinaryService', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('turns a plain upload rejection into an Error with only the provider name and http code (D-07)', async () => {
        const failingUpload = (
            _options: unknown,
            callback: (error: unknown, result?: unknown) => void,
        ) => ({
            end: () => callback({ message: PROVIDER_MESSAGE, http_code: 401 }),
        });
        jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
            failingUpload as never,
        );

        const error = await rejectionOf(service().uploadImage(PORTRAIT));

        expect(error).toBeInstanceOf(Error);
        expect(describeError(error)).toBe('CloudinaryError, code 401');
        expect((error as Error).message).toBe('Errore del provider Cloudinary');
    });

    it('reads the http code of a wrapped listing rejection (D-07)', async () => {
        jest.spyOn(cloudinary.api, 'resources').mockRejectedValue({
            request_options: { fake: 'options' },
            error: { message: PROVIDER_MESSAGE, http_code: 420 },
        });

        const error = await rejectionOf(service().listResources('portraits'));

        expect(describeError(error)).toBe('CloudinaryError, code 420');
        expect((error as Error).message).toBe('Errore del provider Cloudinary');
    });

    it('destroys a portrait by public id with cache invalidation (portrait default)', async () => {
        const destroy = jest
            .spyOn(cloudinary.uploader, 'destroy')
            .mockResolvedValue({ result: 'ok' });

        await service().destroyPortrait(PORTRAIT_PUBLIC_ID);

        expect(destroy.mock.calls).toEqual([
            [PORTRAIT_PUBLIC_ID, { resource_type: 'image', invalidate: true }],
        ]);
    });

    it('treats a missing portrait as done (portrait default)', async () => {
        jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({
            result: 'not found',
        });

        await expect(
            service().destroyPortrait(PORTRAIT_PUBLIC_ID),
        ).resolves.toBeUndefined();
    });

    it('turns a destroy failure into an Error with only the provider name and http code (portrait default)', async () => {
        jest.spyOn(cloudinary.uploader, 'destroy').mockRejectedValue({
            message: PROVIDER_MESSAGE,
            http_code: 500,
        });

        const error = await rejectionOf(
            service().destroyPortrait(PORTRAIT_PUBLIC_ID),
        );

        expect(error).toBeInstanceOf(Error);
        expect(describeError(error)).toBe('CloudinaryError, code 500');
        expect((error as Error).message).toBe('Errore del provider Cloudinary');
    });

    it('never lists an uploaded portrait among the resources of a folder (U-01)', async () => {
        jest.spyOn(cloudinary.api, 'resources').mockResolvedValue({
            resources: [
                { public_id: 'main/town', secure_url: 'https://cdn/town' },
                {
                    public_id: 'characters_profile/victim',
                    secure_url: 'https://cdn/victim',
                },
                {
                    public_id: 'Characters_Profile/other',
                    secure_url: 'https://cdn/other',
                },
                {
                    public_id: 'moved',
                    asset_folder: 'characters_profile',
                    secure_url: 'https://cdn/moved',
                },
            ],
        } as never);

        await expect(service().listResources('main')).resolves.toEqual([
            'https://cdn/town',
        ]);
    });

    it('skips the uploaded portraits folder when listing the subfolders of a parent (U-01)', async () => {
        jest.spyOn(cloudinary.api, 'sub_folders').mockResolvedValue({
            folders: [
                { name: 'main', path: 'main' },
                { name: 'characters_profile', path: 'characters_profile' },
            ],
        } as never);
        const byFolder = jest
            .spyOn(cloudinary.api, 'resources_by_asset_folder')
            .mockImplementation(((path: string) =>
                Promise.resolve({
                    resources: [
                        {
                            public_id: `${path}/asset`,
                            asset_folder: path,
                            secure_url: `https://cdn/${path}/asset`,
                        },
                        {
                            public_id: 'characters_profile/stray',
                            asset_folder: path,
                            secure_url: `https://cdn/${path}/stray`,
                        },
                    ],
                })) as never);

        await expect(
            service().listSubfoldersResources('parent'),
        ).resolves.toEqual(['https://cdn/main/asset']);
        expect(byFolder.mock.calls.map(([path]) => path)).toEqual(['main']);
    });

    it('exposes the cloud name it is configured with (CR-01)', () => {
        const configured = new CloudinaryService({
            get: (key: string) =>
                key === 'CLOUDINARY_CLOUD_NAME' ? 'app-cloud' : undefined,
        } as unknown as ConfigService);

        expect(configured.cloudName).toBe('app-cloud');
        expect(service().cloudName).toBeNull();
    });
});
