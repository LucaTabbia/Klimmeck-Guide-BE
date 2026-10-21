import { model, Types } from 'mongoose';
import { CharacterQuestsSchema } from './character/character-quests.model';
import { PendingQuestSchema } from './pending-quest.model';

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
