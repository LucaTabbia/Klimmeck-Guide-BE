import { model, Schema, Types } from 'mongoose';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { QuestPrizesSchema } from './quest-prizes.model';
import { QuestRegistrationSchema } from './quest-registration.model';
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

        const characters = rescue.path('characters') as unknown as {
            instance: string;
            caster: { instance: string };
        };
        expect(characters.instance).toBe('Array');
        expect(characters.caster.instance).toBe('ObjectId');
        expect(rescue.path('failedQuest').instance).toBe('ObjectId');
    });

    it('requires the wounded list on a rescue, an empty one left by the archiver included', () => {
        const failedQuest = new Types.ObjectId();
        const withRescue = (rescue: Record<string, unknown>) =>
            new Probe({ ...buildQuest(), rescue }).validateSync()?.errors ?? {};

        expect(withRescue({ failedQuest })['rescue.characters']).toBeDefined();
        expect(
            withRescue({ characters: [], failedQuest })['rescue.characters'],
        ).toBeUndefined();
        expect(
            withRescue({ characters: [new Types.ObjectId()], failedQuest })[
                'rescue.characters'
            ],
        ).toBeUndefined();
    });

    it('stores a nullable spell prize as a cast ref', () => {
        expect(QuestPrizesSchema.path('spell').instance).toBe('ObjectId');
        expect(
            new (model('QuestPrizesSpellProbe', QuestPrizesSchema))({}).spell,
        ).toBeNull();
    });

    it('declares the internal placeholder marker on a registration without a default', () => {
        expect(QuestRegistrationSchema.path('archivedAt').instance).toBe(
            'Date',
        );

        const quest = new Probe(
            buildQuest({
                registeredAdventurers: [
                    { character: new Types.ObjectId(), title: 'rookie' },
                ],
            }),
        ).toObject();
        expect(Object.keys(quest.registeredAdventurers[0]).sort()).toEqual([
            'character',
            'title',
        ]);
    });
});
