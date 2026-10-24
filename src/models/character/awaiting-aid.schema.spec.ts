import { model, Types } from 'mongoose';
import { AwaitingAidSchema } from './awaiting-aid.model';
import { CharacterStatusSchema } from './character-status.model';

describe('awaiting aid schemas', () => {
    it('stores the awaiting aid as an embedded subdocument', () => {
        expect(CharacterStatusSchema.path('awaitingAid').instance).toBe(
            'Embedded',
        );
    });

    it('defaults the awaiting aid to null for new and legacy statuses', () => {
        const Status = model('CharacterStatusAidProbe', CharacterStatusSchema);

        expect(
            new Status({ location: new Types.ObjectId(), title: 'rookie' })
                .awaitingAid,
        ).toBeNull();
        expect(
            Status.hydrate({ location: new Types.ObjectId(), title: 'rookie' })
                .awaitingAid,
        ).toBeNull();
    });

    it('stores the quests as cast refs and the start as a date', () => {
        expect(AwaitingAidSchema.path('quest').instance).toBe('ObjectId');
        expect(AwaitingAidSchema.path('aidQuest').instance).toBe('ObjectId');
        expect(AwaitingAidSchema.path('since').instance).toBe('Date');
    });

    it('casts a hex quest id and requires every field', () => {
        const Aid = model('AwaitingAidProbe', AwaitingAidSchema);
        const aid = new Aid({
            quest: new Types.ObjectId().toHexString(),
            aidQuest: new Types.ObjectId(),
            since: new Date('2026-10-24T10:00:00.000Z'),
        });

        expect(aid.validateSync()).toBeUndefined();
        expect(aid.quest instanceof Types.ObjectId).toBe(true);

        const errors = new Aid({}).validateSync()?.errors ?? {};

        for (const path of ['quest', 'aidQuest', 'since']) {
            expect(errors[path]).toBeDefined();
        }
    });
});
