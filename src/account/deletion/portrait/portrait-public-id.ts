export const PORTRAIT_FOLDER = 'characters_profile';

const CLOUDINARY_HOST = 'res.cloudinary.com';
const SECURE_PROTOCOL = 'https:';
const UPLOADED_PORTRAIT_PATH = new RegExp(
    `^/[A-Za-z0-9_-]+/image/upload/(?:v\\d+/)?(${PORTRAIT_FOLDER}/[A-Za-z0-9_-]+)\\.[A-Za-z0-9]+$`,
);

// solo i ritratti caricati dall'app (Phase 26): un URL scelto dal client non deve poter distruggere un'immagine condivisa
export function portraitPublicIdOf(imagePath: unknown): string | null {
    if (typeof imagePath !== 'string') return null;
    const url = parsedUrlOf(imagePath);
    // un URL che il parser riscrive (segmenti con punti, maiuscole, porte) non è quello restituito dall'upload
    if (url === null || url.href !== imagePath) return null;
    if (url.protocol !== SECURE_PROTOCOL || url.host !== CLOUDINARY_HOST) {
        return null;
    }
    if (url.search !== '' || url.hash !== '') return null;
    return UPLOADED_PORTRAIT_PATH.exec(url.pathname)?.[1] ?? null;
}

function parsedUrlOf(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}
