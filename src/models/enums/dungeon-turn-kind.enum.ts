import { registerEnumType } from '@nestjs/graphql';

// tipo di un turno della dungeon (D-12, D-21): sul filo in QuestResult.lastTurnKind
export enum DungeonTurnKind {
    exploration = 'exploration',
    fight = 'fight',
}

registerEnumType(DungeonTurnKind, { name: 'DungeonTurnKind' });
