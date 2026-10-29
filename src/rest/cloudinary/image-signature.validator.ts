import { FileValidator } from '@nestjs/common';
import type { IFile } from '@nestjs/common/pipes/file/interfaces';

export type ImageMimetype = 'image/jpeg' | 'image/png' | 'image/webp';

interface ImageSignature {
    type: ImageMimetype;
    matches: (buffer: Buffer) => boolean;
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46];
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50];
const WEBP_MAGIC_OFFSET = 8;

const IMAGE_SIGNATURES: readonly ImageSignature[] = [
    { type: 'image/jpeg', matches: (buffer) => startsWith(buffer, JPEG_MAGIC) },
    { type: 'image/png', matches: (buffer) => startsWith(buffer, PNG_MAGIC) },
    {
        type: 'image/webp',
        matches: (buffer) =>
            startsWith(buffer, RIFF_MAGIC) &&
            startsWith(buffer, WEBP_MAGIC, WEBP_MAGIC_OFFSET),
    },
];

// il tipo nasce dal contenuto, mai da quello dichiarato dal client: dio invia application/octet-stream (C11)
export function detectImageMimetype(
    buffer: Buffer | undefined,
): ImageMimetype | null {
    if (!buffer) return null;
    return (
        IMAGE_SIGNATURES.find(({ matches }) => matches(buffer))?.type ?? null
    );
}

export class ImageSignatureValidator extends FileValidator {
    isValid(file?: IFile): boolean {
        return detectImageMimetype(file?.buffer) !== null;
    }

    buildErrorMessage(): string {
        return 'Input non valido: file';
    }
}

function startsWith(buffer: Buffer, magic: number[], offset = 0): boolean {
    if (buffer.length < offset + magic.length) return false;
    return magic.every((byte, index) => buffer[offset + index] === byte);
}
