import { model } from 'mongoose';
import { buildQuest } from '../../test/fixtures/quest.fixture';
import { QuestSchema } from './quest/quest.model';

describe('quest generation fields', () => {
    const Probe = model('QuestGenerationFieldsProbe', QuestSchema);

    it('defaults the internal generated flag to false and keeps it off the wire (D-17)', () => {
        expect(new Probe(buildQuest()).generated).toBe(false);
        expect(QuestSchema.path('generated').instance).toBe('Boolean');
    });

    it('declares a unique partial index on the marker of the open generated quests (D-28)', () => {
        expect(QuestSchema.indexes()).toContainEqual([
            { 'infos.markerLocation': 1 },
            expect.objectContaining({
                name: 'quest_generated_open_marker',
                unique: true,
                partialFilterExpression: { generated: true, concludedAt: null },
            }),
        ]);
    });
});
