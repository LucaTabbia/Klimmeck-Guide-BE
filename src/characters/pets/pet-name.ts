import {
    isValidCharacterName,
    normalizeCharacterName,
} from 'src/characters/creation/character-name';
import { GameRuleException } from 'src/gameRules/game-rule.exception';

// stesse regole di forma del nome del personaggio (D-31): nessun filtro di parole, nessuna unicità
export function petNameOf(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined) return null;
    const name = normalizeCharacterName(raw);
    if (!isValidCharacterName(name)) throw GameRuleException.petNameInvalid();
    return name;
}
