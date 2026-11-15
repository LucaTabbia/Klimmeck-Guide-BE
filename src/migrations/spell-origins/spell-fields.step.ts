// UNA TANTUM (Phase 24 D-01, D-07): scrive livello minimo e origine di default sulle magie che non li hanno; il campo vecchio resta a DB — esce dal repo dopo il boot reale
import { SpellOrigin } from 'src/models/enums/spell-origin.enum';
import { levelRowFor } from 'src/quests/outcomes/progression/level-table';

export interface SpellFieldsSet {
    minLevelToLearn?: number;
    origin?: SpellOrigin;
}

export type SpellMigration =
    | { set: SpellFieldsSet }
    | 'alreadyDone'
    | 'unmatched';

export interface LegacySpellFields {
    minXpToLearn?: unknown;
    minLevelToLearn?: unknown;
    origin?: unknown;
}

const isMissing = (value: unknown): boolean =>
    value === undefined || value === null;

const isConvertibleXp = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

// «manca» = assente o nullo; un valore presente, valido o no, non si corregge (C-5)
export function spellMigrationOf(spell: LegacySpellFields): SpellMigration {
    const levelMissing = isMissing(spell.minLevelToLearn);
    const originMissing = isMissing(spell.origin);
    if (!levelMissing && !originMissing) return 'alreadyDone';
    if (levelMissing && !isConvertibleXp(spell.minXpToLearn))
        return 'unmatched';
    const set: SpellFieldsSet = {};
    if (levelMissing && isConvertibleXp(spell.minXpToLearn))
        set.minLevelToLearn = levelRowFor(spell.minXpToLearn).level;
    if (originMissing) set.origin = SpellOrigin.arcane;
    return { set };
}
