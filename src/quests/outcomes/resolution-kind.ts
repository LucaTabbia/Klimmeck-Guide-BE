import { QuestType } from 'src/models/enums/quest-type.enum';
import { refIdOf } from 'src/mongo/document-id';

export type ResolutionKind = 'individual' | 'group' | 'rescue';

// boss = gruppo (D-05); aid automatica con il ferito = catena di soccorso (D-09); il resto, aid fatte a mano comprese, è individuale
export function resolutionKindOf(quest: {
    infos: { type: QuestType };
    rescue?: { character?: unknown } | null;
}): ResolutionKind {
    if (quest.infos.type === QuestType.boss) return 'group';
    if (quest.infos.type === QuestType.aid && refIdOf(quest.rescue?.character))
        return 'rescue';
    return 'individual';
}
