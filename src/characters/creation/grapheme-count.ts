const GRAPHEME_SEGMENTER = new Intl.Segmenter('it', {
    granularity: 'grapheme',
});

// conta i caratteri visibili come il maxLength dei TextField Flutter (non le unità UTF-16)
export function countGraphemes(text: string): number {
    return [...GRAPHEME_SEGMENTER.segment(text)].length;
}
