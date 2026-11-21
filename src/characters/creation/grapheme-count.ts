const GRAPHEME_SEGMENTER = new Intl.Segmenter('it', {
    granularity: 'grapheme',
});

// conta i caratteri visibili come il maxLength dei TextField Flutter (non le unità UTF-16)
export function countGraphemes(text: string): number {
    return [...GRAPHEME_SEGMENTER.segment(text)].length;
}

// un grafema legittimo (sequenza emoji ZWJ) vale poche unità UTF-16: il tetto ferma i grappoli di segni combinanti
export const CODE_UNITS_PER_GRAPHEME = 8;

// stessa regola per il background della creazione e per le aggiunte dell'oste (Phase 25 D-07)
export const exceedsGraphemeLimit = (text: string, max: number): boolean =>
    text.length > max * CODE_UNITS_PER_GRAPHEME || countGraphemes(text) > max;
