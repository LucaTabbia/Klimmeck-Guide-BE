import { model, Schema, Types } from 'mongoose';
import { buildQuest } from '../../test/fixtures';
import { CharacterQuestsSchema } from './character/character-quests.model';
import { PendingQuestSchema } from './pending-quest.model';
import { QuestPartySlotSchema } from './quest/quest-party-slot.model';
import { QuestRequirementsSchema } from './quest/quest-requirements.model';
import { QuestSchema } from './quest/quest.model';

describe('quest lanes schemas', () => {
    it('stores both quest lanes as cast ObjectId refs', () => {
        expect(CharacterQuestsSchema.path('activeStoryQuest').instance).toBe(
            'ObjectId',
        );
        expect(
            CharacterQuestsSchema.path('activeWorldMissionQuest').instance,
        ).toBe('ObjectId');
    });

    it('types the pending quest ref as ObjectId after the reference migration (D-17d)', () => {
        expect(CharacterQuestsSchema.path('pendingQuest').instance).toBe(
            'ObjectId',
        );
    });

    it('defaults every quest lane to null', () => {
        const Probe = model('CharacterQuestsProbe', CharacterQuestsSchema);
        const quests = new Probe({ completedQuests: [] });

        expect(quests.get('activeStoryQuest')).toBeNull();
        expect(quests.get('activeWorldMissionQuest')).toBeNull();
        expect(quests.get('pendingQuest')).toBeNull();
    });

    it('defaults the points spent on a pending quest to zero', () => {
        expect(PendingQuestSchema.path('pointsSpent').instance).toBe('Number');

        const Probe = model('PendingQuestProbe', PendingQuestSchema);
        const pendingQuest = new Probe({
            startDate: new Date('2026-10-21T10:00:00.000Z'),
            waitingTime: 0,
            quest: new Types.ObjectId(),
        });

        expect(pendingQuest.get('pointsSpent')).toBe(0);
    });
});

describe('quest rank slots and registered adventurers schemas', () => {
    it('stores the required adventurers as rank slots defaulting to an empty list', () => {
        expect(
            QuestRequirementsSchema.path('requiredAdventurers').instance,
        ).toBe('Array');
        expect(QuestRequirementsSchema.path('party')).toBeUndefined();

        const Probe = model(
            'QuestRequirementsSlotsProbe',
            QuestRequirementsSchema,
        );

        expect(
            new Probe({ minTitle: 'rookie' }).toObject().requiredAdventurers,
        ).toEqual([]);
    });

    it('accepts rank slots with a known or null title and a positive count', () => {
        const Slot = model('QuestRankSlotProbe', QuestPartySlotSchema);

        expect(
            new Slot({ title: 'hero', count: 5 }).validateSync(),
        ).toBeUndefined();
        expect(
            new Slot({ title: null, count: 1 }).validateSync(),
        ).toBeUndefined();

        const anyRank = new Slot({ count: 2 });

        expect(anyRank.validateSync()).toBeUndefined();
        expect(anyRank.title).toBeNull();
        expect(
            new Slot({ title: 'king', count: 1 }).validateSync()?.errors.title,
        ).toBeDefined();
        expect(
            new Slot({ title: 'hero', count: 0 }).validateSync()?.errors.count,
        ).toBeDefined();
        expect(
            new Slot({ title: 'hero' }).validateSync()?.errors.count,
        ).toBeDefined();
    });

    it('stores each registered adventurer as a cast character ref with its title', () => {
        expect(QuestSchema.path('registrations')).toBeUndefined();

        const registered = (
            QuestSchema.path('registeredAdventurers') as unknown as {
                schema: Schema;
            }
        ).schema;

        expect(registered.path('character').instance).toBe('ObjectId');
        expect(registered.path('title').instance).toBe('String');
    });

    it('defaults the registered adventurers to an empty list and validates their title', () => {
        const Probe = model('QuestRegisteredProbe', QuestSchema);

        expect(
            new Probe(buildQuest()).get('registeredAdventurers'),
        ).toHaveLength(0);
        expect(
            new Probe(
                buildQuest({
                    registeredAdventurers: [
                        { character: new Types.ObjectId(), title: 'king' },
                    ],
                }),
            ).validateSync()?.errors['registeredAdventurers.0.title'],
        ).toBeDefined();
    });

    it('builds a quest fixture with empty rank slots and no party or registrations', () => {
        const quest = buildQuest();

        expect(quest.requirements.requiredAdventurers).toEqual([]);
        expect('party' in quest.requirements).toBe(false);
        expect('registrations' in quest).toBe(false);
    });
});
