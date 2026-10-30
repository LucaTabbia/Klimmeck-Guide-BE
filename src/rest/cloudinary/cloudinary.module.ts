import { Module } from '@nestjs/common';
import { ModerationModule } from 'src/moderation/moderation.module';
import { CloudinaryService } from './cloudinary.service';
import { CloudinaryController } from './cloudinary.controller';
import { PortraitUploadService } from './portrait-upload.service';

@Module({
    imports: [ModerationModule],
    providers: [CloudinaryService, PortraitUploadService],
    exports: [CloudinaryService],
    controllers: [CloudinaryController],
})
export class CloudinaryModule {}
