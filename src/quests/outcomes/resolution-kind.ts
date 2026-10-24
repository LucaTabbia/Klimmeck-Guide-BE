import type { QuestType } from 'src/models/enums/quest-type.enum';

export type ResolutionKind = 'individual' | 'group' | 'rescue';

export function resolutionKindOf(_quest: {
    infos: { type: QuestType };
    rescue?: { character?: unknown } | null;
}): ResolutionKind {
    throw new Error('not implemented');
}
