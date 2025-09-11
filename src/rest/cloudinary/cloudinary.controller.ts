import { Controller, Post, Body, Get, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CloudinaryService } from "./cloudinary.service";

@Controller("cloudinary")
export class CloudinaryController {
    constructor(
        private readonly cloudinaryService: CloudinaryService,
    ) { }

    @Post("getUrls")
    async getUrls(@Body() body: { folder?: string }) {
        try {
            const urls = await this.cloudinaryService.listResources(body.folder);
            return { urls };
        } catch (e) {
            return { message: "Failed to fetch Cloudinary URLs", error: e.message };
        }
    }

    @Post("uploadImage")
    @UseInterceptors(FileInterceptor("file"))
    async uploadImage(@UploadedFile() file: Express.Multer.File) {
        try {
            const result = await this.cloudinaryService.uploadImage(file);
            return {
                url: result.secure_url,
            };
        } catch (err) {
            return { message: "Failed to upload image", error: err.message };
        }
    }
}
