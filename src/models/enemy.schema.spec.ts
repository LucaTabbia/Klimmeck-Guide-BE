import { model } from 'mongoose';
import { buildEnemy } from '../../test/fixtures/enemy.fixture';
import { EnemySchema } from './enemy.model';

const EnemyProbe = model('EnemySchemaProbe', EnemySchema);

const STORED_WITHOUT_WEAKNESSES = {
    name: 'Non migrato',
    xp: 10,
    lifePoints: 100,
};

describe('enemy weaknesses sub-document', () => {
    it('hydrates an enemy stored without weaknesses with two empty lists (D-01)', () => {
        const enemy = EnemyProbe.hydrate(STORED_WITHOUT_WEAKNESSES).toObject();

        expect(enemy.weaknesses).toEqual({ base: [], energy: [] });
    });

    it('stores the weaknesses as a sub-document without its own id (D-01)', () => {
        const enemy = new EnemyProbe(
            buildEnemy({ weaknesses: { base: ['cut'], energy: [] } }),
        ).toObject();

        expect(Object.keys(enemy.weaknesses).sort()).toEqual([
            'base',
            'energy',
        ]);
        expect(enemy.weaknesses).toEqual({ base: ['cut'], energy: [] });
    });

    it('rejects a weakness outside the two enums (D-01)', () => {
        const error = new EnemyProbe(
            buildEnemy({ weaknesses: { base: ['laser'], energy: [] } }),
        ).validateSync();

        expect(Object.keys(error?.errors ?? {})).toEqual(['weaknesses.base.0']);
    });
});
