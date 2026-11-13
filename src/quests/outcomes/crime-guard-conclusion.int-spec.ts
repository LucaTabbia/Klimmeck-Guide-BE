import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistEnemy,
    persistLootItem,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    OUTCOME_START,
    persistQuester,
    type Quester,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const RELEASE = new Date('2026-11-10T22:00:00.000Z');
const PURSE = { gold: 0, silver: 30, copper: 0 };
const PRIZE_COINS = { gold: 0, silver: 1, copper: 50 };
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: PURSE,
};
// tiri: sotto 0,2 l'evento della conclusione avviene, sopra no
const HIT = 0.1;
const MISS = 0.5;

describe('crime arrest and guard encounter at the conclusion (quick 261110-cgd, replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
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
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function enemy(overrides: Record<string, unknown> = {}) {
        return (await persistEnemy(world.models.enemies, {
            locations: ['city'],
            legendary: false,
            ...overrides,
        })) as { _id: Types.ObjectId };
    }

    async function quester(
        type: string,
        prizes: Record<string, unknown> = {},
        infos: Record<string, unknown> = {},
    ): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-cgd-${seq}`,
            questOverrides: {
                infos: {
                    ...buildQuest().infos,
                    type,
                    title: `Quest ${type}`,
                    ...infos,
                },
                prizes: {
                    ...buildQuest().prizes,
                    prizeCoins: PRIZE_COINS,
                    xpPrize: 50,
                    ...prizes,
                },
            },
            characterOverrides: { status: FRESH_STATUS },
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

    async function resultOf(subject: Quester) {
        const results = await world.models.questResults
            .find({ character: subject.characterId })
            .lean<any[]>();
        expect(results).toHaveLength(1);
        return results[0];
    }

    const enemiesOf = (result: { enemies: any[] }) =>
        result.enemies.map(({ enemy, quantity }) => ({
            enemy: String(enemy),
            quantity,
        }));

    const questEndPushes = () =>
        world.push.sent.filter(
            ({ message }) => message.type === PushEventType.questEnd,
        );

    const aidQuests = () =>
        world.models.quests.countDocuments({ 'infos.type': 'aid' });

    describe('crime', () => {
        it('keeps the crime arrest as it is: ten hours of prison, a quarter of the coins lost, no prize (D-09b)', async () => {
            const potion = await persistLootItem(world.models.lootItems);
            const subject = await quester('crime', {
                prizeItem: {
                    itemType: 'LootItem',
                    item: potion._id,
                    quantity: 1,
                },
            });
            chance.load([HIT]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            const character = await characterOf(subject);
            expect(character.status.imprisonedUntil).toEqual(RELEASE);
            expect(character.status.coins).toEqual({
                gold: 0,
                silver: 22,
                copper: 50,
            });
            expect(character.status.xp).toBe(0);
            expect(character.status.awaitingAid ?? null).toBeNull();
            expect(character.quests.pendingQuest).toBeNull();
            expect(character.assets.ownedItems).toEqual([]);
            expect(
                await world.models.pendingQuests.exists({
                    _id: subject.pendingQuest._id,
                }),
            ).toBeNull();
            expect(await aidQuests()).toBe(0);
            const result = await resultOf(subject);
            expect(result).toMatchObject({
                outcome: 'failure',
                arrested: true,
                coinsLost: { gold: 0, silver: 7, copper: 50 },
                guardEncounter: false,
                xpGained: 0,
                rewards: {
                    coins: { gold: 0, silver: 0, copper: 0 },
                    items: [],
                },
            });
            expect(questEndPushes()).toEqual([
                expect.objectContaining({
                    message: expect.objectContaining({
                        id: String(result._id),
                    }),
                }),
            ]);
            expect(world.questQueue.added).toHaveLength(0);
        });

        it('concludes a crime without arrest with every prize (quick 261110-cgd)', async () => {
            const subject = await quester('crime');
            chance.load([MISS]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            const character = await characterOf(subject);
            expect(character.status.imprisonedUntil ?? null).toBeNull();
            expect(character.status.xp).toBe(50);
            expect(character.status.coins).toEqual({
                gold: 0,
                silver: 31,
                copper: 50,
            });
            expect(await resultOf(subject)).toMatchObject({
                outcome: 'success',
                arrested: false,
                coinsLost: null,
                guardEncounter: false,
            });
        });

        it('leaves a lost crime fight at one life point without aid and never arrests (D-19, D-09b)', async () => {
            const foe = await enemy({ locations: ['forest'] });
            const subject = await quester(
                'crime',
                {},
                { enemies: [{ enemy: foe._id, quantity: 1 }] },
            );
            scripted.willEnd('failure');
            chance.load([HIT]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            const character = await characterOf(subject);
            expect(character.status.imprisonedUntil ?? null).toBeNull();
            expect(character.status.awaitingAid ?? null).toBeNull();
            expect(character.status.currentLifePoints).toBe(1);
            expect(character.quests.pendingQuest).toBeNull();
            expect(character.status.coins).toEqual(PURSE);
            expect(await aidQuests()).toBe(0);
            expect(await resultOf(subject)).toMatchObject({
                outcome: 'failure',
                arrested: false,
                coinsLost: null,
                guardEncounter: false,
            });
        });

        it('leaves the other quest types without any arrest roll (quick 261110-cgd)', async () => {
            const subject = await quester('job');
            chance.load([HIT]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            expect(await resultOf(subject)).toMatchObject({
                outcome: 'success',
                arrested: false,
                guardEncounter: false,
            });
            expect(
                (await characterOf(subject)).status.imprisonedUntil ?? null,
            ).toBeNull();
        });
    });

    describe('guard', () => {
        it('concludes a guard without encounter with the usual prizes (quick 261110-cgd)', async () => {
            await enemy({ xp: 5 });
            const subject = await quester('guard');
            chance.load([MISS]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            expect(scripted.contexts).toHaveLength(0);
            expect(await resultOf(subject)).toMatchObject({
                outcome: 'success',
                guardEncounter: false,
                xpGained: 50,
                enemies: [],
                rewards: { coins: { gold: 0, silver: 1, copper: 50 } },
            });
        });

        it('wins the encounter: doubled coins, quest xp plus the enemy xp, enemy known (quick 261110-cgd)', async () => {
            const thief = await enemy({ xp: 5 });
            await enemy({ xp: 5, legendary: true });
            await enemy({ xp: 5, locations: ['forest'] });
            const subject = await quester('guard');
            chance.load([HIT, 0]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            const [context] = scripted.contexts;
            expect(context.enemies.map((entry) => entry.id)).toEqual([
                String(thief._id),
            ]);
            const result = await resultOf(subject);
            expect(result).toMatchObject({
                outcome: 'success',
                guardEncounter: true,
                arrested: false,
                xpGained: 55,
                rewards: { coins: { gold: 0, silver: 3, copper: 0 } },
            });
            expect(enemiesOf(result)).toEqual([
                { enemy: String(thief._id), quantity: 1 },
            ]);
            const character = await characterOf(subject);
            expect(character.status.coins).toEqual({
                gold: 0,
                silver: 33,
                copper: 0,
            });
            expect(character.status.knownEnemies.map(String)).toEqual([
                String(thief._id),
            ]);
        });

        it('fights a pack of two or three weaker enemies when none fits the band alone (quick 261110-cgd)', async () => {
            const rat = await enemy({ xp: 2 });
            const subject = await quester('guard');
            chance.load([HIT, 0]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            const result = await resultOf(subject);
            const [entry, ...others] = enemiesOf(result);
            expect(others).toEqual([]);
            expect(entry.enemy).toBe(String(rat._id));
            expect([2, 3]).toContain(entry.quantity);
            expect(result).toMatchObject({
                guardEncounter: true,
                xpGained: 50 + 2 * entry.quantity,
            });
        });

        it('loses the encounter: one life point in the city, no aid, no prize (quick 261110-cgd)', async () => {
            const thief = await enemy({ xp: 5 });
            const subject = await quester('guard');
            const before = await characterOf(subject);
            scripted.willEnd('failure').willResolve(subject.characterId, {
                hpAfter: 300,
                injuriesAdded: [InjuryType.deepCut],
            });
            chance.load([HIT, 0]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            const character = await characterOf(subject);
            expect(character.status.currentLifePoints).toBe(1);
            expect(character.status.injuries).toEqual(['deepCut']);
            expect(character.status.awaitingAid ?? null).toBeNull();
            expect(character.status.imprisonedUntil ?? null).toBeNull();
            expect(String(character.status.location)).toBe(
                String(before.status.location),
            );
            expect(character.status.coins).toEqual(PURSE);
            expect(character.status.xp).toBe(0);
            expect(character.quests.pendingQuest).toBeNull();
            expect(await aidQuests()).toBe(0);
            expect(world.questQueue.added).toHaveLength(0);
            const result = await resultOf(subject);
            expect(result).toMatchObject({
                outcome: 'failure',
                guardEncounter: true,
                hpAfter: 1,
                injuriesAdded: ['deepCut'],
                xpGained: 0,
                rewards: { coins: { gold: 0, silver: 0, copper: 0 } },
            });
            expect(enemiesOf(result)).toEqual([
                { enemy: String(thief._id), quantity: 1 },
            ]);
            expect(questEndPushes()).toHaveLength(1);
        });

        it('has no encounter when no enemy nor pack fits the band (quick 261110-cgd)', async () => {
            await enemy({ xp: 500 });
            const subject = await quester('guard');
            chance.load([HIT, 0]);

            await expect(resolve(subject)).resolves.toBe('resolved');

            expect(scripted.contexts).toHaveLength(0);
            expect(await resultOf(subject)).toMatchObject({
                outcome: 'success',
                guardEncounter: false,
                xpGained: 50,
            });
        });
    });
});
