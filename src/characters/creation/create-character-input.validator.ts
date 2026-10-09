import { CharacterCreationException } from 'src/characters/creation/character-creation.exception';
import {
    isValidCharacterName,
    normalizeCharacterName,
} from 'src/characters/creation/character-name';
import { countGraphemes } from 'src/characters/creation/grapheme-count';
import { NormalizedCharacterInput } from 'src/characters/creation/normalized-character-input';
import { isAgeAllowedForRace } from 'src/characters/creation/race-traits';
import { CreateCharacterInput } from 'src/models/request/create-character-request.model';

export const BACKGROUND_MAX_GRAPHEMES = 500;
// un grafema legittimo (sequenza emoji ZWJ) vale ~8-11 unità UTF-16: il tetto ferma i cluster
// di segni combinanti che contano un solo grafema qualunque sia la loro dimensione
export const BACKGROUND_MAX_CODE_UNITS = BACKGROUND_MAX_GRAPHEMES * 8;
export const IMAGE_PATH_MAX_LENGTH = 2048;
const SECURE_PROTOCOL = 'https:';

// la validazione del client è solo UX: questa è quella autoritativa (ordine: nome, età, background, immagine)
export function validateCreateCharacterInput(
    input: CreateCharacterInput,
): NormalizedCharacterInput {
    const name = normalizeCharacterName(input.name);
    if (!isValidCharacterName(name)) {
        throw CharacterCreationException.nameInvalid();
    }
    if (!isAgeAllowedForRace(input.race, input.age)) {
        throw CharacterCreationException.ageOutOfRange();
    }
    return {
        name,
        sex: input.sex,
        pronoun: input.pronoun,
        race: input.race,
        classType: input.classType,
        age: input.age,
        background: normalizeBackground(input.background),
        imagePath: normalizeImagePath(input.imagePath),
    };
}

function normalizeBackground(raw: string | null | undefined): string {
    const background = (raw ?? '').trim();
    if (
        background.length > BACKGROUND_MAX_CODE_UNITS ||
        countGraphemes(background) > BACKGROUND_MAX_GRAPHEMES
    ) {
        throw CharacterCreationException.backgroundTooLong();
    }
    return background;
}

function normalizeImagePath(raw: string | null | undefined): string | null {
    const imagePath = (raw ?? '').trim();
    if (imagePath === '') return null;
    if (imagePath.length > IMAGE_PATH_MAX_LENGTH || !isSecureUrl(imagePath)) {
        throw CharacterCreationException.imagePathInvalid();
    }
    return imagePath;
}

function isSecureUrl(value: string): boolean {
    try {
        return new URL(value).protocol === SECURE_PROTOCOL;
    } catch {
        return false;
    }
}
