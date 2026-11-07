import { registerEnumType } from '@nestjs/graphql';

// natura del risultato (Phase 15 D-14): i documenti senza il campo si leggono quest
export enum QuestResultKind {
    quest = 'quest',
    ambush = 'ambush',
}

registerEnumType(QuestResultKind, { name: 'QuestResultKind' });
