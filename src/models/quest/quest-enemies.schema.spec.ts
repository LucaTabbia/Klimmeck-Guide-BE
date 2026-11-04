import { model, Schema, Types } from 'mongoose';
import { QuestType } from '../enums/quest-type.enum';
import { QuestInfosSchema } from './quest-infos.model';

interface ProbedPath {
    instance: string;
    options: { ref?: unknown; required?: unknown; min?: unknown };
}

const enemyEntryPath = (path: string): ProbedPath =>
    (
        QuestInfosSchema.path('enemies') as unknown as { schema: Schema }
    ).schema.path(path) as unknown as ProbedPath;

describe('quest enemies schema', () => {
    const Probe = model('QuestEnemiesInfosProbe', QuestInfosSchema);

    it('stores the quest enemies as subdocuments with an ObjectId ref and a quantity (D-01)', () => {
        expect(QuestInfosSchema.path('enemies').instance).toBe('Array');
        expect(enemyEntryPath('enemy').instance).toBe('ObjectId');
        expect(enemyEntryPath('enemy').options.ref).toBe('Enemy');
        expect(enemyEntryPath('quantity').instance).toBe('Number');
        expect(enemyEntryPath('quantity').options.required).toBe(true);
        expect(enemyEntryPath('quantity').options.min).toBe(1);
    });

    it('defaults the quest enemies to an empty list and drops the legacy single enemy (D-01)', () => {
        const infos = new Probe({
            title: 'Caccia',
            type: QuestType.enemy,
            markerLocation: new Types.ObjectId(),
            relatedLore: [],
            enemy: new Types.ObjectId(),
        }).toObject();

        expect(infos.enemies).toEqual([]);
        expect(Object.keys(infos)).not.toContain('enemy');
    });

    it('rejects an enemy entry without a positive quantity (D-01)', () => {
        const errors = new Probe({
            title: 'Caccia',
            type: QuestType.enemy,
            markerLocation: new Types.ObjectId(),
            relatedLore: [],
            enemies: [{ enemy: new Types.ObjectId(), quantity: 0 }],
        }).validateSync()?.errors;

        expect(Object.keys(errors ?? {})).toEqual(['enemies.0.quantity']);
    });
});
