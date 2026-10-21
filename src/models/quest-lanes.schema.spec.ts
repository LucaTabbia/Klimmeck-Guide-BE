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

    it('keeps the legacy pending quest ref untouched', () => {
        expect(CharacterQuestsSchema.path('pendingQuest').instance).toBe(
            'Mixed',
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

describe('quest party and registrations schemas', () => {
    it('defaults the quest party to an empty list', () => {
        expect(QuestRequirementsSchema.path('party').instance).toBe('Array');

        const Probe = model('QuestRequirementsProbe', QuestRequirementsSchema);
        const requirements = new Probe({
            requiredAdventurers: 0,
            minTitle: 'rookie',
        });

        expect(requirements.toObject().party).toEqual([]);
    });

    it('accepts only party slots with a known title and a positive count', () => {
        const Slot = model('QuestPartySlotProbe', QuestPartySlotSchema);

        expect(
            new Slot({ title: 'hero', count: 5 }).validateSync(),
        ).toBeUndefined();
        expect(
            new Slot({ title: 'hero', count: 0 }).validateSync()?.errors.count,
        ).toBeDefined();
        expect(
            new Slot({ title: 'king', count: 1 }).validateSync()?.errors.title,
        ).toBeDefined();
        expect(
            new Slot({ count: 1 }).validateSync()?.errors.title,
        ).toBeDefined();
    });

    it('stores each registration as a cast character ref with its title', () => {
        const registrations = (
            QuestSchema.path('registrations') as unknown as { schema: Schema }
        ).schema;

        expect(registrations.path('character').instance).toBe('ObjectId');
        expect(registrations.path('title').instance).toBe('String');
    });

    it('defaults the quest registrations to an empty list', () => {
        const Probe = model('QuestProbe', QuestSchema);

        expect(new Probe(buildQuest()).get('registrations')).toHaveLength(0);
    });

    it('builds a quest fixture with an empty party and no registrations', () => {
        const quest = buildQuest();

        expect(quest.requirements.party).toEqual([]);
        expect(quest.registrations).toEqual([]);
    });
});
