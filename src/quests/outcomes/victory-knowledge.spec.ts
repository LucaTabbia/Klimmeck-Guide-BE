import { Types } from 'mongoose';
import {
    knowledgeUpdateOf,
    victoryKnowledgeOf,
} from 'src/quests/outcomes/victory-knowledge';

const goblin = new Types.ObjectId('64b0000000000000000001a1');
const goblinBoss = new Types.ObjectId('64b0000000000000000001a2');
const wolf = new Types.ObjectId('64b0000000000000000001a3');
const goblinPage = new Types.ObjectId('64b0000000000000000001b1');
const wolfPage = new Types.ObjectId('64b0000000000000000001b2');
const forestPage = new Types.ObjectId('64b0000000000000000001b3');

const entryOf = (_id: Types.ObjectId, relatedLore?: unknown[]) => ({
    snapshot: { _id, relatedLore },
});

describe('victory knowledge', () => {
    describe('victoryKnowledgeOf', () => {
        it('knows every enemy of the context and their lore (D-06)', () => {
            expect(
                victoryKnowledgeOf({
                    enemies: [
                        entryOf(goblin, [goblinPage]),
                        entryOf(wolf, [wolfPage, forestPage]),
                    ],
                }),
            ).toEqual({
                enemyIds: [goblin, wolf],
                loreIds: [goblinPage, wolfPage, forestPage],
            });
        });

        it('knows nothing without enemies (D-06)', () => {
            expect(victoryKnowledgeOf({ enemies: [] })).toBeNull();
        });

        it('shares a page but not the exact enemy (D-06)', () => {
            expect(
                victoryKnowledgeOf({
                    enemies: [
                        entryOf(goblin, [goblinPage]),
                        entryOf(goblinBoss, [goblinPage]),
                    ],
                }),
            ).toEqual({
                enemyIds: [goblin, goblinBoss],
                loreIds: [goblinPage],
            });
            expect(
                victoryKnowledgeOf({
                    enemies: [entryOf(goblin, [goblinPage])],
                }),
            ).toEqual({ enemyIds: [goblin], loreIds: [goblinPage] });
        });

        it('lists a repeated enemy once (D-06)', () => {
            expect(
                victoryKnowledgeOf({
                    enemies: [entryOf(goblin), entryOf(goblin, [goblinPage])],
                }),
            ).toEqual({ enemyIds: [goblin], loreIds: [goblinPage] });
        });

        it('skips malformed related lore (D-06)', () => {
            const knowledge = victoryKnowledgeOf({
                enemies: [
                    entryOf(goblin, [
                        null,
                        'non-esadecimale',
                        goblinPage.toHexString(),
                    ]),
                ],
            });

            expect(knowledge).toEqual({
                enemyIds: [goblin],
                loreIds: [goblinPage],
            });
            expect(knowledge?.loreIds[0]).toBeInstanceOf(Types.ObjectId);
        });
    });

    describe('knowledgeUpdateOf', () => {
        it('keeps only the lore the character does not know yet (D-09)', () => {
            expect(
                knowledgeUpdateOf(
                    [goblinPage],
                    [goblinPage, wolfPage, wolfPage],
                    [goblin],
                ),
            ).toEqual({
                fresh: [wolfPage],
                addition: {
                    $addToSet: {
                        'status.unlockedLore': { $each: [wolfPage] },
                        'status.knownEnemies': { $each: [goblin] },
                    },
                },
            });
        });

        it('compares the known lore by hex in every stored form (D-09)', () => {
            expect(
                knowledgeUpdateOf([goblinPage.toHexString()], [goblinPage]),
            ).toEqual({ fresh: [], addition: {} });
        });

        it('adds nothing when there is nothing to learn (D-09)', () => {
            expect(knowledgeUpdateOf(undefined, [], [])).toEqual({
                fresh: [],
                addition: {},
            });
        });

        it('still marks the enemies known when every page is already open (D-06)', () => {
            expect(
                knowledgeUpdateOf([goblinPage], [goblinPage], [goblin]),
            ).toEqual({
                fresh: [],
                addition: {
                    $addToSet: {
                        'status.knownEnemies': { $each: [goblin] },
                    },
                },
            });
        });
    });
});
