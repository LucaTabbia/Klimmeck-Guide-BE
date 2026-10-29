import {
    ImageModerationUnavailableException,
    ImageRejectedException,
} from 'src/moderation/image-moderation.exceptions';
import type { CloudinaryService } from './cloudinary.service';
import { PortraitUploadService } from './portrait-upload.service';
import { FakeImageModerator } from '../../../test/moderation/fake-image-moderator';

const SECURE_URL = 'https://cdn.test/portrait.jpg';
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function portraitFile(): Express.Multer.File {
    return {
        fieldname: 'file',
        originalname: 'portrait.png',
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size: JPEG_BYTES.length,
        buffer: JPEG_BYTES,
    } as Express.Multer.File;
}

describe('PortraitUploadService', () => {
    let moderator: FakeImageModerator;
    let uploadImage: jest.Mock;
    let service: PortraitUploadService;

    beforeEach(() => {
        moderator = new FakeImageModerator();
        uploadImage = jest.fn().mockResolvedValue({ secure_url: SECURE_URL });
        service = new PortraitUploadService(moderator, {
            uploadImage,
        } as unknown as CloudinaryService);
    });

    it('uploads an approved portrait (D-12)', async () => {
        const file = portraitFile();

        await expect(service.upload(file)).resolves.toBe(SECURE_URL);
        expect(moderator.calls).toEqual([
            {
                buffer: JPEG_BYTES,
                mimetype: 'image/jpeg',
                filename: 'portrait.png',
            },
        ]);
        expect(uploadImage).toHaveBeenCalledTimes(1);
        expect(uploadImage).toHaveBeenCalledWith(file);
    });

    it('never sends a rejected portrait to Cloudinary (D-12)', async () => {
        moderator.rejectNext(['nudity']);

        const upload = service.upload(portraitFile());

        await expect(upload).rejects.toBeInstanceOf(ImageRejectedException);
        await expect(upload).rejects.toMatchObject({ reasons: ['nudity'] });
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('never uploads when moderation is unavailable (D-14)', async () => {
        moderator.failNext();

        await expect(service.upload(portraitFile())).rejects.toBeInstanceOf(
            ImageModerationUnavailableException,
        );
        expect(uploadImage).not.toHaveBeenCalled();
    });
});
