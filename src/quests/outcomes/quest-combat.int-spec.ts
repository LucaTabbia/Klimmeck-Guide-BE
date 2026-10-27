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

    function combatQuest(
        type: string,
        enemyId: Types.ObjectId,
        prizes: Record<string, unknown> = { xpPrize: 50 },
    ) {
        return {
            infos: {
                ...buildQuest().infos,
                type,
                title: QUEST_TITLE,
                enemy: enemyId,
            },
            requirements: {
                ...buildQuest().requirements,
                requiredAdventurers: ONE_SEAT,
            },
            prizes: { ...buildQuest().prizes, ...prizes },
        };
    }

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
                assets: { wearedEquipment: { rightHand: sword._id } },
            },
        });
        scripted.willResolve(subject.characterId, { hpAfter: 700 });

        await expect(resolve(subject)).resolves.toBe('resolved');

        const character = await characterOf(subject);
        expect(character.status.currentLifePoints).toBe(700);
        const result = await resultOf(subject);
        expect(result.xpGained).toBe(150);
        expect(String(result.enemy)).toBe(String(foe._id));
        const quest = await questOf(subject.quest._id);
        expect(quest.concludedAt).toEqual(NOW);
        expect(seatsOf(quest)).toEqual([String(subject.characterId)]);
        const [context] = scripted.contexts;
        expect(context.enemy.lifePoints).toBe(1500);
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
        expect(String(aid.infos.enemy)).toBe(String(foe._id));
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

        const character = await characterOf(subject);
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
});
