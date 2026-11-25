import { PORTRAIT_FOLDER } from 'src/rest/cloudinary/portrait-folder';

const CLOUDINARY_HOST = 'res.cloudinary.com';
const SECURE_PROTOCOL = 'https:';
const UPLOADED_PORTRAIT_PATH = new RegExp(
    `^/([A-Za-z0-9_-]+)/image/upload/(?:v\\d+/)?(${PORTRAIT_FOLDER}/[A-Za-z0-9_-]+)\\.[A-Za-z0-9]+$`,
);
const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\/]/g;

// solo i ritratti caricati dall'app nel suo cloud (Phase 26, CR-01): un URL scelto dal client non deve poter distruggere un'immagine altrui
export function portraitPublicIdOf(
    imagePath: unknown,
    cloudName: string | null,
): string | null {
    if (typeof imagePath !== 'string' || !cloudName) return null;
    const url = parsedUrlOf(imagePath);
    // un URL che il parser riscrive (segmenti con punti, maiuscole, porte) non è quello restituito dall'upload
    if (url === null || url.href !== imagePath) return null;
    if (url.protocol !== SECURE_PROTOCOL || url.host !== CLOUDINARY_HOST) {
        return null;
    }
    if (url.search !== '' || url.hash !== '') return null;
    const match = UPLOADED_PORTRAIT_PATH.exec(url.pathname);
    return match && match[1] === cloudName ? match[2] : null;
}

// ogni grafia dello stesso public id conta come «mostrato»: versione, estensione, trasformazioni, cloud, query (CR-01)
export function portraitReferencePatternOf(
    publicIds: readonly string[],
): RegExp {
    const alternatives = publicIds
        .map((publicId) => publicId.replace(REGEXP_SPECIAL_CHARACTERS, '\\$&'))
        .join('|');
    return new RegExp(`/(?:${alternatives})(?:[.?#]|$)`);
}

function parsedUrlOf(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}
