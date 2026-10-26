import { QuestType } from 'src/models/enums/quest-type.enum';
import { refIdOf } from 'src/mongo/document-id';

export type ResolutionKind = 'individual' | 'group' | 'rescue';

const hasWounded = (characters: unknown): boolean =>
    Array.isArray(characters) &&
    characters.some((character) => refIdOf(character) !== null);

// boss = gruppo (D-05); aid automatica con almeno un ferito = soccorso di gruppo (D-09); il resto, aid fatte a mano comprese, è individuale
// una aid rimasta senza feriti (tutti cancellati) è conclusa dall'archivio; un soccorritore già in corsia si risolve come individuale
export function resolutionKindOf(quest: {
    infos: { type: QuestType };
    rescue?: { characters?: unknown } | null;
}): ResolutionKind {
    if (quest.infos.type === QuestType.boss) return 'group';
    if (
        quest.infos.type === QuestType.aid &&
        hasWounded(quest.rescue?.characters)
    )
        return 'rescue';
    return 'individual';
}
