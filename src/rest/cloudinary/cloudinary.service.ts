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
                { folder: "characters_profile" }, // opzionale
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result as UploadApiResponse);
                },
            ).end(file.buffer);
        });
    }

    async listResources(folder?: string) {
        const result = await cloudinary.api.resources({
            type: "upload",
            prefix: folder,
            max_results: 100,
        });

        return result.resources.map((r) => r.secure_url);
    }
}
