import { ContentIssue } from 'src/content/content-issue';
import {
    IdField,
    NonEmptyIdList,
    OneOf,
    RecordOf,
    Text,
} from 'src/content/schema/common.content';
import { EntrySource, validateEntry } from 'src/content/schema/validate-entry';
import { PoiType } from 'src/models/enums/poi-type.enum';

const POI_TYPES: readonly string[] = Object.values(PoiType);

abstract class FixEntry {
    @Text()
    key: string;
}

export class NormalizePoiTypesFix extends FixEntry {
    @OneOf(['normalizePoiTypes'])
    kind: 'normalizePoiTypes';

    @IdField()
    target: string;

    @RecordOf(
        (_, value) => typeof value === 'string' && POI_TYPES.includes(value),
        'deve mappare ogni valore sporco su un PoiType',
    )
    replacements: Record<string, PoiType>;
}

export class RenameCityFix extends FixEntry {
    @OneOf(['renameCity'])
    kind: 'renameCity';

    @IdField()
    target: string;

    @Text()
    from: string;

    @Text()
    to: string;
}

export class DeleteQuestsFix extends FixEntry {
    @OneOf(['deleteQuests'])
    kind: 'deleteQuests';

    @NonEmptyIdList()
    ids: string[];
}

export class UnsetLoreUnlockedFix extends FixEntry {
    @OneOf(['unsetLoreUnlocked'])
    kind: 'unsetLoreUnlocked';
}

// insieme chiuso (T-11-14): nessun «set generico» su collezioni arbitrarie
export const FIX_KINDS = {
    normalizePoiTypes: NormalizePoiTypesFix,
    renameCity: RenameCityFix,
    deleteQuests: DeleteQuestsFix,
    unsetLoreUnlocked: UnsetLoreUnlockedFix,
} as const;

export type FixKind = keyof typeof FIX_KINDS;

function isFixKind(kind: unknown): kind is FixKind {
    return typeof kind === 'string' && Object.hasOwn(FIX_KINDS, kind);
}

export function fixEntryIssues(entry: EntrySource): ContentIssue[] {
    const { kind, key } = entry.raw;
    if (isFixKind(kind)) return validateEntry<FixEntry>(FIX_KINDS[kind], entry);
    return [
        {
            file: entry.file,
            line: entry.line,
            entryId: typeof key === 'string' ? key : null,
            path: 'kind',
            message: `kind: kind sconosciuto «${String(kind)}» (ammessi: ${Object.keys(FIX_KINDS).join(', ')})`,
        },
    ];
}
