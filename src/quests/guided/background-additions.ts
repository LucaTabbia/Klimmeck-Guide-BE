import { Types } from 'mongoose';
import {
    BACKGROUND_ADDITION_MAX_GRAPHEMES,
    CODE_UNITS_PER_GRAPHEME,
    exceedsGraphemeLimit,
} from 'src/characters/creation/grapheme-count';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { hexOf, presentOnly } from 'src/quests/guided/ids';

// regole pure delle aggiunte ai background (Phase 25 D-05..D-08)
// tetto di forma sul filo, sopra quello di dominio: fra 1001 grafemi e 8000 unità risponde il codice proprio
export const BACKGROUND_ADDITION_MAX_FORM_LENGTH =
    BACKGROUND_ADDITION_MAX_GRAPHEMES * CODE_UNITS_PER_GRAPHEME;

export interface BackgroundAdditionEntry {
    character: Types.ObjectId;
    text: string;
}

// testo pronto per la bozza: trim; vuoto, soli spazi o non testo = null (nessuna aggiunta, mai un errore); oltre il tetto = BACKGROUND_ADDITION_TOO_LONG
export function additionTextOf(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (text === '') return null;
    if (exceedsGraphemeLimit(text, BACKGROUND_ADDITION_MAX_GRAPHEMES)) {
        throw GameRuleException.backgroundAdditionTooLong();
    }
    return text;
}

// fusione per personaggio, come i premi: ogni voce inviata sostituisce l'aggiunta del suo personaggio, le altre restano; un testo vuoto cancella quella salvata; lo stesso personaggio due volte = OUTCOME_OVERRIDE_INVALID (prima di tutto); ogni testo inviato passa da additionTextOf
export function mergedAdditions(
    saved: readonly BackgroundAdditionEntry[],
    sent: readonly BackgroundAdditionEntry[],
): BackgroundAdditionEntry[] {
    assertOneEntryPerCharacter(sent);
    const sentByCharacter = new Map(
        sent.map((entry) => [hexOf(entry.character), cleanEntryOf(entry)]),
    );
    const savedKeys = new Set(saved.map(({ character }) => hexOf(character)));
    return presentOnly([
        ...saved.map(({ character, text }) => {
            const key = hexOf(character);
            return sentByCharacter.has(key)
                ? (sentByCharacter.get(key) ?? null)
                : { character, text };
        }),
        ...[...sentByCharacter]
            .filter(([key]) => !savedKeys.has(key))
            .map(([, entry]) => entry),
    ]);
}

// aggiunta di un personaggio riletta dalla bozza e rivalidata; null = nessuna (anche su una bozza senza la sezione)
export function additionFor(
    additions: readonly BackgroundAdditionEntry[] | null | undefined,
    characterId: Types.ObjectId,
): string | null {
    const target = hexOf(characterId);
    const entry = (additions ?? []).find(
        ({ character }) => hexOf(character) === target,
    );
    return entry ? additionTextOf(entry.text) : null;
}

function assertOneEntryPerCharacter(
    entries: readonly BackgroundAdditionEntry[],
): void {
    const characters = entries.map(({ character }) => hexOf(character));
    if (new Set(characters).size !== characters.length) {
        throw GameRuleException.outcomeOverrideInvalid();
    }
}

function cleanEntryOf({
    character,
    text,
}: BackgroundAdditionEntry): BackgroundAdditionEntry | null {
    const clean = additionTextOf(text);
    return clean === null ? null : { character, text: clean };
}
