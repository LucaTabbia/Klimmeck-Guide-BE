import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

const PROVIDER_ERROR_NAME = 'CloudinaryError';
const PROVIDER_ERROR_MESSAGE = 'Errore del provider Cloudinary';

interface ProviderRejection {
    http_code?: unknown;
    error?: { http_code?: unknown } | null;
}

// Cloudinary rigetta con oggetti semplici: nel log restano solo nome e http_code, mai il payload (D-07)
function providerErrorOf(rejection: unknown): Error {
    if (rejection instanceof Error) return rejection;
    const { http_code, error } = (rejection ?? {}) as ProviderRejection;
    const code = http_code ?? error?.http_code;
    return Object.assign(new Error(PROVIDER_ERROR_MESSAGE), {
        name: PROVIDER_ERROR_NAME,
        ...(typeof code === 'number' ? { code } : {}),
    });
}

function rethrowProviderError(rejection: unknown): never {
    throw providerErrorOf(rejection);
}

@Injectable()
export class CloudinaryService {
    constructor(config: ConfigService) {
        cloudinary.config({
            cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
            api_key: config.get<string>('CLOUDINARY_API_KEY'),
            api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
        });
    }

    async uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
        return new Promise((resolve, reject) => {
            cloudinary.uploader
                .upload_stream(
                    { folder: 'characters_profile' },
                    (error, result) => {
                        if (error) reject(providerErrorOf(error));
                        else resolve(result as UploadApiResponse);
                    },
                )
                .end(file.buffer);
        });
    }

    async listResources(folder: string) {
        let allUrls: string[] = [];
        let nextCursor: string | undefined = undefined;
        do {
            const result = await cloudinary.api
                .resources({
                    type: 'upload',
                    prefix: folder ? `${folder}/` : undefined,
                    max_results: 100,
                    next_cursor: nextCursor,
                })
                .catch(rethrowProviderError);
            const urls = result.resources.map(
                (resource) => resource.secure_url,
            );
            allUrls = [...allUrls, ...urls];
            nextCursor = result.next_cursor;
        } while (nextCursor);
        return allUrls;
    }

    async listSubfoldersResources(folder: string) {
        const subfolders = await cloudinary.api
            .sub_folders(folder)
            .catch(rethrowProviderError);
        let allUrls: string[] = [];
        for (const sub of subfolders['folders']) {
            let nextCursor: string | undefined = undefined;
            do {
                const result = await cloudinary.api
                    .resources_by_asset_folder(sub.path, {
                        type: 'upload',
                        max_results: 100,
                        next_cursor: nextCursor,
                    })
                    .catch(rethrowProviderError);
                const urls = result.resources.map(
                    (resource) => resource.secure_url,
                );
                allUrls = [...allUrls, ...urls];
                nextCursor = result.next_cursor;
            } while (nextCursor);
        }
        return allUrls;
    }
}
