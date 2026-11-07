import { Types } from 'mongoose';
import { knowledgeAdditionOf } from 'src/lore/knowledge-addition';

describe('knowledge addition', () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    const e = new Types.ObjectId();

    it('adds nothing for two empty lists (D-14)', () => {
        expect(knowledgeAdditionOf([], [])).toEqual({});
        expect(knowledgeAdditionOf([])).toEqual({});
    });

    it('adds the lore with one add-to-set each (D-01)', () => {
        expect(knowledgeAdditionOf([a, b])).toEqual({
            $addToSet: { 'status.unlockedLore': { $each: [a, b] } },
        });
    });

    it('adds lore and enemies in one operator (D-01)', () => {
        expect(knowledgeAdditionOf([a], [e])).toEqual({
            $addToSet: {
                'status.unlockedLore': { $each: [a] },
                'status.knownEnemies': { $each: [e] },
            },
        });
        expect(
            Object.keys(knowledgeAdditionOf([], [e]).$addToSet ?? {}),
        ).toEqual(['status.knownEnemies']);
    });

    it('copies the lists it receives (D-14)', () => {
        const lore = [a];
        const enemies = [e];
        const addition = knowledgeAdditionOf(lore, enemies);
        lore.push(b);
        enemies.push(b);

        expect(addition).toEqual({
            $addToSet: {
                'status.unlockedLore': { $each: [a] },
                'status.knownEnemies': { $each: [e] },
            },
        });
    });
});
