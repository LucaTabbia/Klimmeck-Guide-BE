import {
    Body,
    Controller,
    MaxFileSizeValidator,
    ParseFilePipe,
    Post,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BadUserInputException } from 'src/validation/bad-user-input.exception';
import { CloudinaryService } from './cloudinary.service';
import { CloudinaryFolderRequest } from './cloudinary-folder.request';
import { ImageSignatureValidator } from './image-signature.validator';
import { IMAGE_UPLOAD_LIMITS, MAX_IMAGE_BYTES } from './image-upload';

const imageFilePipe = new ParseFilePipe({
    validators: [
        new MaxFileSizeValidator({ maxSize: MAX_IMAGE_BYTES }),
        new ImageSignatureValidator({}),
    ],
    exceptionFactory: () => BadUserInputException.of(['file']),
});

// gli errori del provider risalgono al filtro globale: niente testo di Cloudinary nella risposta (D-07)
@Controller('cloudinary')
export class CloudinaryController {
    constructor(private readonly cloudinaryService: CloudinaryService) {}

    @Post('getUrls')
    async getUrls(@Body() body: CloudinaryFolderRequest) {
        const urls = await this.cloudinaryService.listResources(body.folder);
        return { urls };
    }

    @Post('getSubfoldersUrls')
    async getSubfoldersUrls(@Body() body: CloudinaryFolderRequest) {
        const urls = await this.cloudinaryService.listSubfoldersResources(
            body.folder,
        );
        return { urls };
    }

    @Post('uploadImage')
    @UseInterceptors(FileInterceptor('file', { limits: IMAGE_UPLOAD_LIMITS }))
    async uploadImage(@UploadedFile(imageFilePipe) file: Express.Multer.File) {
        const result = await this.cloudinaryService.uploadImage(file);
        return { url: result.secure_url };
    }
}
