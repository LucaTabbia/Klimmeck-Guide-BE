import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { CombatEnemySnapshot } from './combat/combat-context';
import { combatContextOf, enemyFactsOf } from './combatant-plan';
import type {
    ResolutionCatalog,
    ResolutionCharacter,
    ResolutionQuest,
} from './resolution-loader.service';

const id = (hex: string) => new Types.ObjectId(hex.padStart(24, '0'));

const GOBLIN_ID = id('c1');
const CAPO_ID = id('c2');

const quest: ResolutionQuest = {
    _id: id('91'),
    infos: {
        type: QuestType.enemy,
        title: 'Goblin al passo',
        markerLocation: id('81'),
    },
};

const hero: ResolutionCharacter = {
    _id: id('a1'),
    status: { title: TitleType.rookie },
    assets: null,
} as ResolutionCharacter;

const catalogWith = (
    enemies: { snapshot: CombatEnemySnapshot; quantity: number }[],
): ResolutionCatalog => ({
    enemies,
    rewards: { rarities: new Map(), spells: new Map(), spellPool: [] },
    equipment: new Map(),
    spells: new Map(),
    loot: new Map(),
    recoveryTimes: new Map(),
    spellMaxUsages: new Map(),
});

const goblins = { snapshot: { _id: GOBLIN_ID, xp: 10 }, quantity: 3 };
const capo = { snapshot: { _id: CAPO_ID, xp: 63 }, quantity: 1 };

describe('combatContextOf', () => {
    it('returns no combat context without valid enemies (D-02)', () => {
        expect(combatContextOf(quest, catalogWith([]), [hero])).toBeNull();
    });

    it('builds the context with every enemy and its quantity (D-02)', () => {
        const context = combatContextOf(quest, catalogWith([goblins, capo]), [
            hero,
        ]);

        expect(
            context?.enemies.map(({ id: enemyId, quantity }) => ({
                enemyId,
                quantity,
            })),
        ).toEqual([
            { enemyId: GOBLIN_ID.toHexString(), quantity: 3 },
            { enemyId: CAPO_ID.toHexString(), quantity: 1 },
        ]);
    });
});

describe('enemyFactsOf', () => {
    it('sums the enemy xp by quantity (D-02)', () => {
        expect(enemyFactsOf(catalogWith([goblins, capo]))).toEqual({
            entries: [
                { enemy: GOBLIN_ID, quantity: 3 },
                { enemy: CAPO_ID, quantity: 1 },
            ],
            xp: 93,
        });
    });

    it('counts a non numeric enemy xp as 0 (D-02)', () => {
        const broken = {
            snapshot: { _id: GOBLIN_ID, xp: Number.NaN },
            quantity: 2,
        };
        const unknown = { snapshot: { _id: CAPO_ID }, quantity: 1 };

        expect(enemyFactsOf(catalogWith([broken, unknown]))).toEqual({
            entries: [
                { enemy: GOBLIN_ID, quantity: 2 },
                { enemy: CAPO_ID, quantity: 1 },
            ],
            xp: 0,
        });
    });

    it('returns no enemy facts for an empty catalog (D-02)', () => {
        expect(enemyFactsOf(catalogWith([]))).toBeNull();
    });
});
