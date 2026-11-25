// cartella dei ritratti caricati dai giocatori: unica fonte per l'upload, per il riconoscimento alla cancellazione e per gli elenchi (Phase 26 U-01)
export const PORTRAIT_FOLDER = 'characters_profile';

const EDGE_SLASHES = /^\/+|\/+$/g;

function normalizedFolderOf(path: string): string {
    return path.replace(EDGE_SLASHES, '').toLowerCase();
}

// la cartella dei ritratti o qualunque cosa sotto, con qualunque maiuscola e barre ai bordi
export function isPortraitFolderPath(path: string): boolean {
    const normalized = normalizedFolderOf(path);
    return (
        normalized === PORTRAIT_FOLDER ||
        normalized.startsWith(`${PORTRAIT_FOLDER}/`)
    );
}

// gli elenchi servono le cartelle di preset: mai la radice (elencherebbe tutto il cloud) né i ritratti dei giocatori (U-01)
export function isListableFolder(folder: string): boolean {
    return normalizedFolderOf(folder) !== '' && !isPortraitFolderPath(folder);
}
