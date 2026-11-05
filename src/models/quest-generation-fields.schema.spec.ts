import { model } from 'mongoose';
import { buildQuest } from '../../test/fixtures/quest.fixture';
import { EnemySchema } from './enemy.model';
import { EquipmentItemSchema } from './equipment-item.model';
import { QuestRewardsSchema } from './quest-result/quest-result.model';
import { QuestPrizesSchema } from './quest/quest-prizes.model';
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

describe('quest generation catalog fields', () => {
    const EnemyProbe = model('QuestGenerationEnemyProbe', EnemySchema);
    const EquipmentProbe = model(
        'QuestGenerationEquipmentProbe',
        EquipmentItemSchema,
    );
    const PrizesProbe = model('QuestGenerationPrizesProbe', QuestPrizesSchema);
    const RewardsProbe = model(
        'QuestGenerationRewardsProbe',
        QuestRewardsSchema,
    );

    it('defaults Enemy.legendary to false on a hydrated document (D-04)', () => {
        expect(EnemyProbe.hydrate({ name: 'Goblin' }).legendary).toBe(false);
        expect(EnemySchema.path('legendary').instance).toBe('Boolean');
    });

    it('leaves accessoryUseTypes absent until written (D-24)', () => {
        const plain = new EquipmentProbe({
            name: 'Spada',
            equipType: 'weapon',
        }).toObject();
        expect(Object.keys(plain)).not.toContain('accessoryUseTypes');

        const ring = new EquipmentProbe({
            name: 'Anello',
            equipType: 'ring',
            accessoryUseTypes: ['attack', 'defense'],
        });
        expect(ring.toObject().accessoryUseTypes).toEqual([
            'attack',
            'defense',
        ]);
        expect(
            ring.validateSync()?.errors?.['accessoryUseTypes.0'],
        ).toBeUndefined();

        const invalid = new EquipmentProbe({
            name: 'Anello',
            equipType: 'ring',
            accessoryUseTypes: ['nope'],
        });
        expect(Object.keys(invalid.validateSync()?.errors ?? {})).toEqual([
            'accessoryUseTypes.0',
        ]);
    });

    it('defaults the quest pet prize and the obtained pet to null (D-21)', () => {
        expect(new PrizesProbe({}).pet).toBeNull();
        expect(QuestPrizesSchema.path('pet').instance).toBe('ObjectId');
        expect(new RewardsProbe({}).pet).toBeNull();
        expect(QuestRewardsSchema.path('pet').instance).toBe('ObjectId');
    });
});
