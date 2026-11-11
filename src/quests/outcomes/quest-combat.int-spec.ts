import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistEnemy,
    persistEquipmentItem,
    persistLootItem,
    persistSpell,
    spellBook,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const QUEST_TITLE = 'Il bandito del passo';
const COINS = { gold: 0, silver: 0, copper: 0 };
// mirror e stato coerenti (D-03): gli usi della magia attiva stanno nella voce di stato
const knowingSpell = (spell: Types.ObjectId, usages: number) => {
    const book = spellBook([{ spell, usages, active: true }]);
    return {
        status: { spells: book.spells, spellStates: book.spellStates },
        assets: { activeSpells: book.activeSpells },
    };
};
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: COINS,
};
const ONE_SEAT = [{ title: null, count: 1 }];

describe('QuestResolutionService.resolveStandard (individual) with an enemy (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let warn: jest.SpyInstance;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const scripted = new ScriptedCombatResolver();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance, combat: scripted });
        service = world.harness.app.get(QuestResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function enemy(overrides: Record<string, unknown> = {}) {
        return (await persistEnemy(world.models.enemies, {
            xp: 100,
            ...overrides,
        })) as { _id: Types.ObjectId; lifePoints: number };
    }

    type EnemyEntry = { enemy: Types.ObjectId; quantity: number };

    function questWithEnemies(
        type: string,
        enemies: EnemyEntry[],
        prizes: Record<string, unknown> = { xpPrize: 50 },
    ) {
        return {
            infos: {
                ...buildQuest().infos,
                type,
                title: QUEST_TITLE,
                enemies,
            },
            requirements: {
                ...buildQuest().requirements,
                requiredAdventurers: ONE_SEAT,
            },
            prizes: { ...buildQuest().prizes, ...prizes },
        };
    }

    const combatQuest = (
        type: string,
        enemyId: Types.ObjectId,
        prizes?: Record<string, unknown>,
    ) => questWithEnemies(type, [{ enemy: enemyId, quantity: 1 }], prizes);

    const enemiesOf = (holder: { enemies?: EnemyEntry[] }) =>
        (holder.enemies ?? []).map(({ enemy, quantity }) => ({
            enemy: String(enemy),
            quantity,
        }));

    async function fighter(
        type: string,
        enemyId: Types.ObjectId,
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-combat-${seq}`,
            questOverrides: combatQuest(type, enemyId),
            ...options,
            characterOverrides: {
                ...options.characterOverrides,
                status: {
                    ...FRESH_STATUS,
                    ...options.characterOverrides?.status,
                },
            },
        });
        await registerDevice(world.harness, created.player);
        return created;
    }

    const resolve = (subject: Quester) =>
        service.resolveStandard({
            pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const questOf = (id: unknown) =>
        world.models.quests.findById(id).lean<any>();

    const resultOf = async (subject: Quester) => {
        const results = await world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();
        expect(results).toHaveLength(1);
        return results[0];
    };

    const seatsOf = (quest: any) =>
        (quest.registeredAdventurers ?? []).map((seat: any) =>
            String(seat.character),
        );

    it('wins a registered enemy quest and concludes it', async () => {
        const foe = await enemy({ lifePoints: 1500 });
        const sword = await persistEquipmentItem(world.models.equipmentItems, {
            damages: { base: { type: 'cut', power: 30 }, energy: [] },
        });
        const subject = await fighter('enemy', foe._id, {
            characterOverrides: {
                assets: { wornEquipment: { rightHand: sword._id } },
            },
        });
        scripted.willResolve(subject.characterId, { hpAfter: 700 });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const character = await characterOf(subject);
        expect(character.status.currentLifePoints).toBe(700);
        const result = await resultOf(subject);
        expect(result.xpGained).toBe(150);
        expect(enemiesOf(result)).toEqual([
            { enemy: String(foe._id), quantity: 1 },
        ]);
        const quest = await questOf(subject.quest._id);
        expect(quest.concludedAt).toEqual(NOW);
        expect(seatsOf(quest)).toEqual([String(subject.characterId)]);
        const [context] = scripted.contexts;
        expect(context.enemies[0].lifePoints).toBe(1500);
        expect(context.participants).toEqual([
            expect.objectContaining({
                characterId: subject.characterId.toHexString(),
                equipment: [
                    {
                        itemId: String(sword._id),
                        slot: 'rightHand',
                        damages: {
                            base: [{ type: 'cut', power: 30 }],
                            energy: [],
                        },
                        equipType: 'weapon',
                        accessoryUseTypes: null,
                    },
                ],
            }),
        ]);
    });

    it('waits for aid after a defeat and clones the quest', async () => {
        const foe = await enemy();
        const subject = await fighter('enemy', foe._id, {
            questOverrides: combatQuest('enemy', foe._id, {
                xpPrize: 50,
                prizeCoins: { gold: 0, silver: 2, copper: 0 },
            }),
        });
        scripted
            .willEnd('failure')
            .willResolve(subject.characterId, { hpAfter: 300 });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const character = await characterOf(subject);
        expect(character.quests.pendingQuest).toBeNull();
        expect(character.status.currentLifePoints).toBe(300);
        expect(character.status.coins).toEqual(COINS);
        const { awaitingAid } = character.status;
        expect(String(awaitingAid.quest)).toBe(String(subject.quest._id));
        expect(awaitingAid.since).toEqual(NOW);
        const quest = await questOf(subject.quest._id);
        expect(quest.concludedAt).toBeNull();
        expect(seatsOf(quest)).toEqual([]);
        const aid = await questOf(awaitingAid.aidQuest);
        expect(aid.infos).toMatchObject({
            type: 'aid',
            title: `Soccorso: ${QUEST_TITLE}`,
        });
        expect(String(aid.infos.markerLocation)).toBe(
            String(subject.quest.infos.markerLocation),
        );
        expect(enemiesOf(aid.infos)).toEqual([
            { enemy: String(foe._id), quantity: 1 },
        ]);
        expect(aid.requirements.requiredAdventurers).toEqual([
            expect.objectContaining({ title: null, count: 1 }),
        ]);
        expect(aid.requirements.requiredPoints).toBeNull();
        expect(aid.rescue.characters.map(String)).toEqual([
            String(subject.characterId),
        ]);
        expect(String(aid.rescue.failedQuest)).toBe(String(subject.quest._id));
        const result = await resultOf(subject);
        expect(result).toMatchObject({ outcome: 'failure', xpGained: 0 });
        const written = await world.models.questResults.find().lean<any[]>();
        expect(written).toHaveLength(1);
        expect(written.map((result) => result.acknowledgedAt)).toEqual(
            written.map(() => null),
        );
        expect(world.questQueue.added).toEqual([
            expect.objectContaining({
                name: 'aid-timeout',
                options: expect.objectContaining({
                    jobId: `aid-${String(aid._id)}`,
                }),
            }),
        ]);
        expect(
            world.push.sent.filter(
                ({ message }) => message.type === PushEventType.questEnd,
            ),
        ).toEqual([
            expect.objectContaining({
                message: expect.objectContaining({ id: String(result._id) }),
            }),
        ]);
    });

    it('fights a multi-enemy quest and earns the summed enemy xp (D-02)', async () => {
        const goblin = await enemy({ name: 'Goblin', xp: 10, lifePoints: 100 });
        const capo = await enemy({ name: 'Capo', xp: 63, lifePoints: 600 });
        const subject = await fighter('enemy', goblin._id, {
            questOverrides: questWithEnemies('enemy', [
                { enemy: goblin._id, quantity: 3 },
                { enemy: capo._id, quantity: 1 },
            ]),
        });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const result = await resultOf(subject);
        expect(result.outcome).toBe('success');
        expect(result.xpGained).toBe(50 + 3 * 10 + 63);
        expect(enemiesOf(result)).toEqual([
            { enemy: String(goblin._id), quantity: 3 },
            { enemy: String(capo._id), quantity: 1 },
        ]);
        const [context] = scripted.contexts;
        expect(
            context.enemies.map(({ id, quantity }) => ({ id, quantity })),
        ).toEqual([
            { id: String(goblin._id), quantity: 3 },
            { id: String(capo._id), quantity: 1 },
        ]);
    });

    it('fights a legacy quest stored with the single enemy (D-28)', async () => {
        const foe = await enemy();
        const legacy = combatQuest('enemy', foe._id);
        const infos: Record<string, unknown> = {
            ...legacy.infos,
            enemy: foe._id,
        };
        delete infos.enemies;
        const { insertedId } = await world.models.quests.collection.insertOne({
            ...buildQuest(),
            ...legacy,
            infos,
        });
        const subject = await fighter('enemy', foe._id, {
            quest: { _id: insertedId },
        });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const result = await resultOf(subject);
        expect(result.xpGained).toBe(150);
        expect(enemiesOf(result)).toEqual([
            { enemy: String(foe._id), quantity: 1 },
        ]);
        expect(scripted.contexts).toHaveLength(1);
        expect(scripted.contexts[0].enemies).toHaveLength(1);
    });

    it('skips an orphan enemy entry with a warning of ids only (D-28)', async () => {
        const foe = await enemy();
        const orphanId = new Types.ObjectId();
        const subject = await fighter('enemy', foe._id, {
            questOverrides: questWithEnemies('enemy', [
                { enemy: orphanId, quantity: 4 },
                { enemy: foe._id, quantity: 2 },
            ]),
        });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const result = await resultOf(subject);
        expect(result.xpGained).toBe(50 + 2 * 100);
        expect(enemiesOf(result)).toEqual([
            { enemy: String(foe._id), quantity: 2 },
        ]);
        const [context] = scripted.contexts;
        expect(
            context.enemies.map(({ id, quantity }) => ({ id, quantity })),
        ).toEqual([{ id: String(foe._id), quantity: 2 }]);
        const orphanWarnings = warn.mock.calls
            .map(([message]) => String(message))
            .filter((message) => message.includes(String(orphanId)));
        expect(orphanWarnings).toEqual([
            `Nemico ${String(orphanId)} della missione ${String(subject.quest._id)} inesistente: voce scartata`,
        ]);
    });

    it('never drops the hit points below 1', async () => {
        const foe = await enemy();
        const subject = await fighter('enemy', foe._id);
        scripted
            .willEnd('failure')
            .willResolve(subject.characterId, { hpAfter: 0 });

        await resolve(subject);

        const character = await characterOf(subject);
        expect(character.status.currentLifePoints).toBe(1);
    });

    it('leaves a won hunt on the board', async () => {
        const foe = await enemy();
        const subject = await fighter('hunt', foe._id);

        await expect(resolve(subject)).resolves.toBe('resolved');

        const quest = await questOf(subject.quest._id);
        expect(quest.concludedAt).toBeNull();
        expect(scripted.contexts).toHaveLength(1);
    });

    it('creates an aid for a lost hunt too', async () => {
        const foe = await enemy();
        const subject = await fighter('hunt', foe._id);
        scripted.willEnd('failure');

        await resolve(subject);

        const character = await characterOf(subject);
        const aid = await questOf(character.status.awaitingAid.aidQuest);
        expect(aid.infos.type).toBe('aid');
        expect(String(aid.rescue.failedQuest)).toBe(String(subject.quest._id));
    });

    it('spends the spell usages and schedules their recovery', async () => {
        const foe = await enemy();
        const spell = await persistSpell(world.models.spells, {
            recoveryTime: 5000,
        });
        const subject = await fighter('enemy', foe._id, {
            characterOverrides: knowingSpell(spell._id, 2),
        });
        scripted.willResolve(subject.characterId, {
            spellsUsed: [{ spellId: String(spell._id), usages: 1 }],
        });

        await resolve(subject);

        // istante dell'esito = NOW del FixedClock dell'harness
        const dueAt = new Date(NOW.getTime() + 5000);
        const character = await characterOf(subject);
        expect(character.status.spellStates).toEqual([
            { spell: spell._id, usages: 1, recoveries: [dueAt] },
        ]);
        expect(character.assets.activeSpells).toEqual([
            expect.objectContaining({ spell: spell._id, usages: 1 }),
        ]);
        const result = await resultOf(subject);
        expect(result.spellsUsed).toEqual([
            expect.objectContaining({ spell: spell._id, usages: 1 }),
        ]);
        expect(world.spellQueue.added).toEqual([
            expect.objectContaining({
                name: 'recover',
                data: {
                    characterId: subject.characterId.toHexString(),
                    spellId: String(spell._id),
                    dueAt: dueAt.getTime(),
                },
                options: expect.objectContaining({ delay: 5000 }),
            }),
        ]);
    });

    it('spends the consumables used in combat', async () => {
        const foe = await enemy();
        const potion = await persistLootItem(world.models.lootItems);
        const subject = await fighter('enemy', foe._id, {
            characterOverrides: {
                assets: {
                    ownedItems: [
                        { itemType: 'LootItem', item: potion._id, quantity: 2 },
                    ],
                },
            },
        });
        scripted.willResolve(subject.characterId, {
            consumablesUsed: [{ itemId: String(potion._id), quantity: 1 }],
        });

        await resolve(subject);

        const character = await characterOf(subject);
        expect(character.assets.ownedItems).toEqual([
            expect.objectContaining({ item: potion._id, quantity: 1 }),
        ]);
        const result = await resultOf(subject);
        expect(result.consumablesUsed).toEqual([
            expect.objectContaining({ item: potion._id, quantity: 1 }),
        ]);
    });

    it('resolves even when the spell recovery queue is down', async () => {
        const foe = await enemy();
        const spell = await persistSpell(world.models.spells, {
            recoveryTime: 5000,
        });
        const subject = await fighter('enemy', foe._id, {
            characterOverrides: knowingSpell(spell._id, 2),
        });
        scripted.willResolve(subject.characterId, {
            spellsUsed: [{ spellId: String(spell._id), usages: 1 }],
        });
        world.spellQueue.failAdd = true;

        await expect(resolve(subject)).resolves.toBe('resolved');

        await resultOf(subject);
        const messages = warn.mock.calls.map(([message]) => String(message));
        expect(
            messages.some((message) => message.includes(String(spell._id))),
        ).toBe(true);
    });

    it('concludes a hand-made aid without rescue once won (D-06)', async () => {
        const foe = await enemy();
        const subject = await fighter('aid', foe._id);

        await expect(resolve(subject)).resolves.toBe('resolved');

        const quest = await questOf(subject.quest._id);
        expect(quest.rescue ?? null).toBeNull();
        expect(quest.concludedAt).toEqual(NOW);
        expect(scripted.contexts).toHaveLength(1);
        const result = await resultOf(subject);
        expect(result.outcome).toBe('success');
    });

    describe('the knowledge of a victory', () => {
        const hexes = (ids: unknown[] | undefined) => (ids ?? []).map(String);
        const pages = () => [0, 1, 2].map(() => new Types.ObjectId());

        async function twoFoes([p1, p2, p3]: Types.ObjectId[]) {
            const goblin = await enemy({ name: 'Goblin', relatedLore: [p1] });
            const wolf = await enemy({ name: 'Lupo', relatedLore: [p2, p3] });
            return { goblin, wolf };
        }

        function twoFoesQuest(goblin: Types.ObjectId, wolf: Types.ObjectId) {
            return questWithEnemies('enemy', [
                { enemy: goblin, quantity: 2 },
                { enemy: wolf, quantity: 1 },
            ]);
        }

        it('teaches the winner the enemies and their lore (D-06)', async () => {
            const lore = pages();
            const { goblin, wolf } = await twoFoes(lore);
            const subject = await fighter('enemy', goblin._id, {
                questOverrides: twoFoesQuest(goblin._id, wolf._id),
            });

            await expect(resolve(subject)).resolves.toBe('resolved');

            const character = await characterOf(subject);
            expect(hexes(character.status.unlockedLore)).toEqual(hexes(lore));
            expect(hexes(character.status.knownEnemies)).toEqual(
                hexes([goblin._id, wolf._id]),
            );
            const result = await resultOf(subject);
            expect(hexes(result.loreUnlocked)).toEqual(hexes(lore));
        });

        it('lists only the new lore on the sheet (D-09)', async () => {
            const lore = pages();
            const { goblin, wolf } = await twoFoes(lore);
            const subject = await fighter('enemy', goblin._id, {
                questOverrides: twoFoesQuest(goblin._id, wolf._id),
                characterOverrides: { status: { unlockedLore: [lore[0]] } },
            });

            await expect(resolve(subject)).resolves.toBe('resolved');

            const character = await characterOf(subject);
            expect(hexes(character.status.unlockedLore)).toEqual(hexes(lore));
            const result = await resultOf(subject);
            expect(hexes(result.loreUnlocked)).toEqual(hexes(lore.slice(1)));
        });

        it('marks known only the exact enemy defeated (D-06)', async () => {
            const goblinPage = new Types.ObjectId();
            const goblin = await enemy({
                name: 'Goblin',
                relatedLore: [goblinPage],
            });
            const goblinBoss = await enemy({
                name: 'Goblin boss',
                relatedLore: [goblinPage],
            });
            const subject = await fighter('enemy', goblin._id);

            await expect(resolve(subject)).resolves.toBe('resolved');

            const character = await characterOf(subject);
            expect(hexes(character.status.knownEnemies)).toEqual(
                hexes([goblin._id]),
            );
            expect(hexes(character.status.knownEnemies)).not.toContain(
                String(goblinBoss._id),
            );
            expect(hexes(character.status.unlockedLore)).toEqual(
                hexes([goblinPage]),
            );
        });

        it('teaches nothing on a defeat (D-06)', async () => {
            const lore = pages();
            const { goblin, wolf } = await twoFoes(lore);
            const subject = await fighter('enemy', goblin._id, {
                questOverrides: twoFoesQuest(goblin._id, wolf._id),
                characterOverrides: { status: { unlockedLore: [lore[0]] } },
            });
            scripted
                .willEnd('failure')
                .willResolve(subject.characterId, { hpAfter: 300 });

            await expect(resolve(subject)).resolves.toBe('resolved');

            const character = await characterOf(subject);
            expect(hexes(character.status.unlockedLore)).toEqual(
                hexes([lore[0]]),
            );
            expect(hexes(character.status.knownEnemies)).toEqual([]);
            const result = await resultOf(subject);
            expect(result.loreUnlocked).toEqual([]);
        });
    });
});
