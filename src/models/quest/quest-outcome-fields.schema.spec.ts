import { model, Schema } from 'mongoose';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { QuestPrizesSchema } from './quest-prizes.model';
import { QuestSchema } from './quest.model';

describe('quest outcome fields', () => {
    const Probe = model('QuestOutcomeFieldsProbe', QuestSchema);

    it('defaults the conclusion marker and the rescue to null', () => {
        expect(new Probe(buildQuest()).concludedAt).toBeNull();
        expect(new Probe(buildQuest()).rescue).toBeNull();
        expect(QuestSchema.path('concludedAt').instance).toBe('Date');
    });

    it('stores the rescue refs as cast ObjectIds', () => {
        const rescue = (
            QuestSchema.path('rescue') as unknown as { schema: Schema }
        ).schema;

        expect(rescue.path('character').instance).toBe('ObjectId');
        expect(rescue.path('failedQuest').instance).toBe('ObjectId');
    });

    it('stores a nullable spell prize as a cast ref', () => {
        expect(QuestPrizesSchema.path('spell').instance).toBe('ObjectId');
        expect(
            new (model('QuestPrizesSpellProbe', QuestPrizesSchema))({}).spell,
        ).toBeNull();
    });
});
