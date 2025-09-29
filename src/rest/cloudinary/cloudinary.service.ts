import { Injectable } from "@nestjs/common";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

@Injectable()
export class CloudinaryService {
    constructor() {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
    }

    async uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                { folder: "characters_profile" },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result as UploadApiResponse);
                },
            ).end(file.buffer);
        });
    }


    async listResources(folder: string) {
        let allUrls: string[] = [];
        let nextCursor: string | undefined = undefined;
        do {
            const result = await cloudinary.api.resources({
                type: 'upload',
                prefix: folder ? `${folder}/` : undefined,
                max_results: 100,
                next_cursor: nextCursor,
            });
            const urls = result.resources.map((r: any) => r.secure_url);
            allUrls = [...allUrls, ...urls];
            nextCursor = result.next_cursor;
        } while (nextCursor);
        return allUrls;
    }

    async listSubfoldersResources(folder: string) {
        const subfolders = await cloudinary.api.sub_folders(folder);
        let allUrls: string[] = [];
        for (const sub of subfolders["folders"]) {
            let nextCursor: string | undefined = undefined;
            do {
                const result = await cloudinary.api.resources_by_asset_folder(sub.path, {
                    type: 'upload',
                    max_results: 100,
                    next_cursor: nextCursor,
                });
                const urls = result.resources.map((r: any) => r.secure_url);
                allUrls = [...allUrls, ...urls];
                nextCursor = result.next_cursor;
            } while (nextCursor);
        }
        return allUrls;
    }
}
