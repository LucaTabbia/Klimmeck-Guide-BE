import type { Schema } from 'mongoose';
import { CharacterSchema } from './character/character.model';
import { PendingQuestSchema } from './pending-quest.model';
import { QuestSchema } from './quest/quest.model';
import { UserSchema } from './user.model';

interface SweepIndex {
    collection: string;
    name: string;
    schema: Schema;
    key: Record<string, 1>;
}

const SWEEP_INDEXES: SweepIndex[] = [
    {
        collection: 'characters',
        name: 'character_standard_lane',
        schema: CharacterSchema,
        key: { deletedAt: 1, 'quests.pendingQuest': 1 },
    },
    {
        collection: 'characters',
        name: 'character_awaiting_aid_since',
        schema: CharacterSchema,
        key: { deletedAt: 1, 'status.awaitingAid.since': 1 },
    },
    {
        collection: 'characters',
        name: 'character_active_travel_end',
        schema: CharacterSchema,
        key: { deletedAt: 1, 'status.activeTravel.endTime': 1 },
    },
    {
        collection: 'characters',
        name: 'character_spell_recoveries',
        schema: CharacterSchema,
        key: { deletedAt: 1, 'status.spellStates.recoveries': 1 },
    },
    {
        collection: 'quests',
        name: 'quest_forming_parties',
        schema: QuestSchema,
        key: { 'infos.type': 1, concludedAt: 1, startedAt: 1 },
    },
    {
        collection: 'quests',
        name: 'quest_registered_character',
        schema: QuestSchema,
        key: { 'registeredAdventurers.character': 1 },
    },
    {
        collection: 'pendingquests',
        name: 'pending_quest_lane_dates',
        schema: PendingQuestSchema,
        key: { quest: 1, startDate: 1, arrivedAt: 1 },
    },
    {
        collection: 'users',
        name: 'user_current_character',
        schema: UserSchema,
        key: { currentCharacter: 1 },
    },
];

describe('sweep and lane indexes', () => {
    it.each(SWEEP_INDEXES)(
        'declares the $name index on $collection (D-17b)',
        ({ name, schema, key }) => {
            expect(schema.indexes()).toContainEqual([
                key,
                expect.objectContaining({ name }),
            ]);
        },
    );
});
