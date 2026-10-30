import { Injectable } from '@nestjs/common';
import { ImageRejectedException } from 'src/moderation/image-moderation.exceptions';
import { ImageModerator } from 'src/moderation/image-moderator';
import { BadUserInputException } from 'src/validation/bad-user-input.exception';
import { CloudinaryService } from './cloudinary.service';
import { detectImageMimetype } from './image-signature.validator';

// la moderazione precede l'upload: un'immagine respinta non tocca mai Cloudinary (D-12)
@Injectable()
export class PortraitUploadService {
    constructor(
        private readonly moderator: ImageModerator,
        private readonly cloudinary: CloudinaryService,
    ) {}

    async upload(file: Express.Multer.File): Promise<string> {
        const mimetype = detectImageMimetype(file.buffer);
        if (!mimetype) throw BadUserInputException.of(['file']);
        const verdict = await this.moderator.moderate({
            buffer: file.buffer,
            mimetype,
            filename: file.originalname,
        });
        if (!verdict.approved)
            throw new ImageRejectedException(verdict.reasons);
        return (await this.cloudinary.uploadImage(file)).secure_url;
    }
}
