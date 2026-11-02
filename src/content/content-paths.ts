import { resolve } from 'path';

// src/content e dist/content stanno entrambi a due livelli dalla radice: lo stesso percorso vale per ts-jest e per il compilato
export const DEFAULT_CONTENT_DIR = resolve(__dirname, '../../content');

export function contentDirOf(flag: string | undefined): string {
    return flag ? resolve(flag) : DEFAULT_CONTENT_DIR;
}
