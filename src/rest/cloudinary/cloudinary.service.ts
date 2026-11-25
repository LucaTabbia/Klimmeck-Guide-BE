import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { isPortraitFolderPath, PORTRAIT_FOLDER } from './portrait-folder';

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

interface ListedResource {
    public_id?: unknown;
    asset_folder?: unknown;
    secure_url: string;
}

function isUploadedPortrait({ public_id, asset_folder }: ListedResource) {
    return [public_id, asset_folder].some(
        (path) => typeof path === 'string' && isPortraitFolderPath(path),
    );
}

// un ritratto caricato da un giocatore non esce mai da un elenco, qualunque cartella sia chiesta (Phase 26 U-01)
function listableUrlsOf(resources: readonly ListedResource[]): string[] {
    return resources
        .filter((resource) => !isUploadedPortrait(resource))
        .map((resource) => resource.secure_url);
}

@Injectable()
export class CloudinaryService {
    // il cloud dell'app: solo i suoi ritratti si possono distruggere (Phase 26 CR-01)
    readonly cloudName: string | null;

    constructor(config: ConfigService) {
        this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME') || null;
        cloudinary.config({
            cloud_name: this.cloudName ?? undefined,
            api_key: config.get<string>('CLOUDINARY_API_KEY'),
            api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
        });
    }

    async uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
        return new Promise((resolve, reject) => {
            cloudinary.uploader
                .upload_stream({ folder: PORTRAIT_FOLDER }, (error, result) => {
                    if (error) reject(providerErrorOf(error));
                    else resolve(result as UploadApiResponse);
                })
                .end(file.buffer);
        });
    }

    // ogni risposta senza errore chiude la richiesta, anche «not found»: l'asset è già sparito (Phase 26)
    async destroyPortrait(publicId: string): Promise<void> {
        await cloudinary.uploader
            .destroy(publicId, { resource_type: 'image', invalidate: true })
            .catch(rethrowProviderError);
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
            allUrls = [...allUrls, ...listableUrlsOf(result.resources)];
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
            if (isPortraitFolderPath(sub.path)) continue;
            let nextCursor: string | undefined = undefined;
            do {
                const result = await cloudinary.api
                    .resources_by_asset_folder(sub.path, {
                        type: 'upload',
                        max_results: 100,
                        next_cursor: nextCursor,
                    })
                    .catch(rethrowProviderError);
                allUrls = [...allUrls, ...listableUrlsOf(result.resources)];
                nextCursor = result.next_cursor;
            } while (nextCursor);
        }
        return allUrls;
    }
}
