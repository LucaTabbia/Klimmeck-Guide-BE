import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer } from '../../../test/authz/player-fixture';
import {
    buildQuest,
    persistEnemy,
    persistLootItem,
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
import { TurnFailingDungeonResolver } from '../../../test/quests/turn-failing-dungeon-resolver';
import { QuestLane } from '../acceptance/quest-lanes';
import {
    classifyEligibility,
    registrationRuleOf,
} from '../acceptance/quest-eligibility';
import { AID_TIMEOUT_MS } from './aid/aid-timeout';
import type { ChanceSource } from './chance-source';
import {
    type DungeonContext,
    type DungeonResolution,
    DungeonResolver,
} from './dungeon/dungeon-resolver';
import { PlaceholderDungeonResolver } from './dungeon/placeholder-dungeon-resolver';
import { QuestResolutionService } from './quest-resolution.service';
import { RescueResolutionService } from './rescue-resolution.service';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const QUEST_TITLE = 'Le cripte di Bosa';
const NO_COINS = { gold: 0, silver: 0, copper: 0 };
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: NO_COINS,
};
const ONE_SEAT = [{ title: null, count: 1 }];
const SAVED_TURN = { index: 4, kind: 'exploration', total: 8 };
const NO_TURNS = {
    turnsTotal: null,
    turnsCompleted: null,
    lastTurn: null,
    lastTurnKind: null,
};

type EnemyEntry = { enemy: Types.ObjectId; quantity: number };

interface DungeonAidWorld {
    enemies: EnemyEntry[];
    wounded: Quester;
    aid: any;
}

interface DungeonAidOptions {
    failingTurn?: number;
    prizes?: Record<string, unknown>;
    enemies?: EnemyEntry[];
}

// l'harness accetta solo useValue: la porta della dungeon si sostituisce per caso e registra i contesti ricevuti
class SwappableDungeonResolver extends DungeonResolver {
    readonly contexts: DungeonContext[] = [];
    private current: DungeonResolver;

    constructor(readonly placeholder: DungeonResolver) {
        super();
        this.current = placeholder;
    }

    use(resolver: DungeonResolver): void {
        this.current = resolver;
    }

    reset(): void {
        this.current = this.placeholder;
        this.contexts.length = 0;
    }

    explore(context: DungeonContext, chance: ChanceSource): DungeonResolution {
        this.contexts.push(context);
        return this.current.explore(context, chance);
    }
}

// l'aid di dungeon nasce da una vera dungeon da 4 gruppi persa al turno 4 (esplorazione) con la porta di test: rescue.turn { 4, exploration, 8 }
describe('RescueResolutionService on a dungeon aid (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let rescues: RescueResolutionService;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const scripted = new ScriptedCombatResolver();
    const dungeon = new SwappableDungeonResolver(
        new PlaceholderDungeonResolver(scripted),
    );

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            combat: scripted,
            overrides: [{ token: DungeonResolver, useValue: dungeon }],
        });
        service = world.harness.app.get(QuestResolutionService);
        rescues = world.harness.app.get(RescueResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
        dungeon.reset();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function enemy(name: string, xp: number) {
        return (await persistEnemy(world.models.enemies, {
            name,
            xp,
            lifePoints: 200,
        })) as { _id: Types.ObjectId };
    }

    async function fourGroups(): Promise<EnemyEntry[]> {
        const ghoul = await enemy('Ghoul', 20);
        const rat = await enemy('Ratto delle cripte', 5);
        const lich = await enemy('Custode delle ossa', 120);
        const wraith = await enemy('Spettro del pozzo', 40);
        return [
            { enemy: ghoul._id, quantity: 1 },
            { enemy: rat._id, quantity: 2 },
            { enemy: lich._id, quantity: 1 },
            { enemy: wraith._id, quantity: 1 },
        ];
    }

    function questWithEnemies(
        type: string,
        enemies: EnemyEntry[],
        prizes: Record<string, unknown> = {},
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
            prizes: { ...buildQuest().prizes, xpPrize: 50, ...prizes },
        };
    }

    async function quester(
        options: Omit<QuesterOptions, 'twitchId'>,
    ): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-dungeon-aid-${seq}`,
            characterOverrides: { status: FRESH_STATUS },
            ...options,
        });
        await registerDevice(world.harness, created.player);
        return created;
    }

    const resolve = (subject: Quester) =>
        service.resolveStandard({
            pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });

    const characterOf = (id: unknown) =>
        world.models.characters.findById(id).lean<any>();

    const questOf = (id: unknown) =>
        world.models.quests.findById(id).lean<any>();

    // il ferito ha già il foglio della dungeon persa: si legge quello dell'aid
    const resultOf = async (id: unknown, questId?: unknown) => {
        const results = await world.models.questResults
            .find({
                character: id,
                ...(questId ? { 'quest.id': questId } : {}),
            })
            .lean<any[]>();
        expect(results).toHaveLength(1);
        return results[0];
    };

    const aidResultOf = (id: unknown, aid: { _id: unknown }) =>
        resultOf(id, aid._id);

    const turnsOf = (result: Record<string, unknown>) => ({
        turnsTotal: result.turnsTotal,
        turnsCompleted: result.turnsCompleted,
        lastTurn: result.lastTurn,
        lastTurnKind: result.lastTurnKind,
    });

    const asStrings = (entries: readonly EnemyEntry[]) =>
        entries.map(({ enemy: ref, quantity }) => ({
            enemy: String(ref),
            quantity,
        }));

    // la quest letta come la legge l'accettazione: nessun errore = accettabile
    const refusalOf = (quest: any, character: any) => {
        const rule = registrationRuleOf(quest.infos.type, quest.requirements);
        expect(rule).not.toBe('invalid');
        return classifyEligibility(
            quest,
            character,
            QuestLane.standard,
            rule === 'invalid' ? null : rule,
        );
    };

    const turnAt = (index: number) => ({
        index,
        kind: index % 2 === 0 ? 'exploration' : 'fight',
        total: 8,
    });

    // vera sconfitta al turno indicato (di default il 4 di 8, esplorazione); poi la porta torna al segnaposto e la porta di combattimento riparte da zero
    async function dungeonAidWorld({
        failingTurn = SAVED_TURN.index,
        prizes = {},
        enemies: given,
    }: DungeonAidOptions = {}): Promise<DungeonAidWorld> {
        const enemies = given ?? (await fourGroups());
        const wounded = await quester({
            questOverrides: questWithEnemies('dungeon', enemies, prizes),
        });
        dungeon.use(
            new TurnFailingDungeonResolver(dungeon.placeholder, [failingTurn]),
        );
        await expect(resolve(wounded)).resolves.toBe('resolved');
        const character = await characterOf(wounded.characterId);
        const aid = await questOf(character.status.awaitingAid.aidQuest);
        expect(aid.rescue.turn).toEqual(turnAt(failingTurn));
        scripted.reset();
        dungeon.reset();
        return { enemies, wounded, aid };
    }

    const rescuerOn = (aid: any) => quester({ quest: { _id: aid._id } });

    it('walks the rescuer through the turns up to the saved one (D-12, D-13)', async () => {
        const { wounded, aid } = await dungeonAidWorld();
        const rescuer = await rescuerOn(aid);

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        expect(
            dungeon.contexts.map((context) => context.lastTurnIndex),
        ).toEqual([4]);
        expect(scripted.contexts).toHaveLength(2);
        const freed = await characterOf(wounded.characterId);
        expect(freed.status.awaitingAid).toBeNull();
        expect((await aidResultOf(wounded.characterId, aid)).outcome).toBe(
            'rescued',
        );
    });

    it('writes the turns of a rescuer who wins a dungeon aid (D-21)', async () => {
        const { wounded, aid } = await dungeonAidWorld();
        const rescuer = await rescuerOn(aid);

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        const result = await resultOf(rescuer.characterId);
        expect(result.outcome).toBe('success');
        expect(turnsOf(result)).toEqual({
            turnsTotal: 8,
            turnsCompleted: 5,
            lastTurn: 5,
            lastTurnKind: 'exploration',
        });
        expect(result).toMatchObject({ stagesCleared: 2, stagesTotal: 4 });
        expect(turnsOf(await aidResultOf(wounded.characterId, aid))).toEqual(
            NO_TURNS,
        );
    });

    // prova con l'eligibilità dell'accettazione sui documenti a DB: corsia libera, nessuna attesa di soccorso, nessun rifiuto
    it('frees the rescued wounded who can take the dungeon again (D-12)', async () => {
        const { wounded, aid } = await dungeonAidWorld();
        const rescuer = await rescuerOn(aid);

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        const freed = await characterOf(wounded.characterId);
        expect(freed.status.awaitingAid).toBeNull();
        expect(freed.quests.pendingQuest ?? null).toBeNull();
        const original = await questOf(wounded.quest._id);
        expect(original.concludedAt ?? null).toBeNull();
        expect(refusalOf(original, freed)).toBeNull();
    });

    // prova con l'eligibilità dell'accettazione: la dungeon resta senza chiusura e un secondo personaggio la può accettare
    it('keeps the dungeon open to the others while its aid is open (D-15)', async () => {
        const { wounded, aid } = await dungeonAidWorld();
        seq += 1;
        const other = await createPlayer(world.harness, {
            twitchId: `tw-dungeon-aid-${seq}`,
        });

        const open = await questOf(aid._id);
        expect(open.concludedAt ?? null).toBeNull();
        const original = await questOf(wounded.quest._id);
        expect(original.concludedAt ?? null).toBeNull();
        expect(
            refusalOf(original, await characterOf(other.character!._id)),
        ).toBeNull();
    });

    // 4 xp: l'aid ne porta 4 × 5/8 = 2; la nuova aid dall'originale 4 × 2/8 = 1, dall'aid già scalata 2 × 2/5 = 0
    it('applies the lost aid rule and saves the turn where the rescuers fell (D-10, D-26)', async () => {
        const { wounded, aid } = await dungeonAidWorld({
            prizes: { xpPrize: 4 },
        });
        const rescuer = await rescuerOn(aid);
        scripted.willEnd('failure');

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        expect(scripted.contexts).toHaveLength(1);
        const dead = await characterOf(wounded.characterId);
        expect(dead.deletionReason).toBe('death');
        const death = await aidResultOf(wounded.characterId, aid);
        expect(death.outcome).toBe('death');
        expect(turnsOf(death)).toEqual({
            turnsTotal: 8,
            turnsCompleted: 4,
            lastTurn: 5,
            lastTurnKind: 'exploration',
        });
        const fallen = await resultOf(rescuer.characterId);
        expect(fallen.outcome).toBe('failure');
        expect(turnsOf(fallen)).toEqual({
            turnsTotal: 8,
            turnsCompleted: 1,
            lastTurn: 2,
            lastTurnKind: 'fight',
        });
        const rescuerAfter = await characterOf(rescuer.characterId);
        const chained = await questOf(rescuerAfter.status.awaitingAid.aidQuest);
        expect(String(chained.rescue.failedQuest)).toBe(
            String(wounded.quest._id),
        );
        expect(chained.infos.title).toBe(`Soccorso: ${QUEST_TITLE}`);
        expect(chained.rescue.characters.map(String)).toEqual([
            String(rescuer.characterId),
        ]);
        expect(chained.rescue.turn).toEqual({
            index: 1,
            kind: 'fight',
            total: 8,
        });
        expect(chained.prizes.xpPrize).toBe(1);
    });

    it('saves the exploration turn where the rescuers fell (C-IN-04, D-26, D-29)', async () => {
        const { wounded, aid } = await dungeonAidWorld();
        const rescuer = await rescuerOn(aid);
        dungeon.use(new TurnFailingDungeonResolver(dungeon.placeholder, [2]));

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        expect(scripted.contexts).toHaveLength(1);
        expect((await characterOf(wounded.characterId)).deletionReason).toBe(
            'death',
        );
        const fallen = await resultOf(rescuer.characterId);
        expect(fallen.outcome).toBe('failure');
        expect(turnsOf(fallen)).toEqual({
            turnsTotal: 8,
            turnsCompleted: 2,
            lastTurn: 3,
            lastTurnKind: 'exploration',
        });
        const rescuerAfter = await characterOf(rescuer.characterId);
        const chained = await questOf(rescuerAfter.status.awaitingAid.aidQuest);
        expect(chained.rescue.turn).toEqual(turnAt(2));
    });

    // caduta sulla prima esplorazione: il soccorritore esplora e basta, nessun gruppo affrontato, quota 1/8 (50 xp → 6)
    it('walks no enemy group when the wounded fell on the first turn (C-IN-04, D-12, D-20)', async () => {
        const { aid } = await dungeonAidWorld({ failingTurn: 0 });
        expect(aid.prizes.xpPrize).toBe(6);
        const rescuer = await rescuerOn(aid);

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        expect(
            dungeon.contexts.map((context) => context.lastTurnIndex),
        ).toEqual([0]);
        expect(scripted.contexts).toHaveLength(0);
        const result = await resultOf(rescuer.characterId);
        expect(result.outcome).toBe('success');
        expect(result.enemies ?? []).toEqual([]);
        expect(result.xpGained).toBe(6);
        expect(turnsOf(result)).toEqual({
            turnsTotal: 8,
            turnsCompleted: 1,
            lastTurn: 1,
            lastTurnKind: 'exploration',
        });
        expect(result).toMatchObject({ stagesCleared: 0, stagesTotal: 4 });
    });

    // una dungeon da un gruppo ha due turni: caduta nello scontro = quota 2/2, premio intero
    it('rescues a one group dungeon with the whole prize (C-IN-04, D-12, D-20)', async () => {
        const [ghoul] = await fourGroups();
        const wounded = await quester({
            questOverrides: questWithEnemies('dungeon', [ghoul]),
        });
        dungeon.use(new TurnFailingDungeonResolver(dungeon.placeholder, [1]));
        await expect(resolve(wounded)).resolves.toBe('resolved');
        const character = await characterOf(wounded.characterId);
        const aid = await questOf(character.status.awaitingAid.aidQuest);
        expect(aid.rescue.turn).toEqual({ index: 1, kind: 'fight', total: 2 });
        expect(aid.prizes.xpPrize).toBe(50);
        scripted.reset();
        dungeon.reset();
        const rescuer = await rescuerOn(aid);

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        expect(
            dungeon.contexts.map((context) => context.lastTurnIndex),
        ).toEqual([1]);
        expect(scripted.contexts).toHaveLength(1);
        const result = await resultOf(rescuer.characterId);
        expect(result.outcome).toBe('success');
        expect(result.xpGained).toBe(50 + 20);
        expect(turnsOf(result)).toEqual({
            turnsTotal: 2,
            turnsCompleted: 2,
            lastTurn: 2,
            lastTurnKind: 'fight',
        });
    });

    // il ferito attende da sette giorni: la data si sposta a DB, l'orologio condiviso dagli altri casi resta fermo
    it('writes where the wounded fell on a death by aid timeout (D-21)', async () => {
        const { wounded, aid } = await dungeonAidWorld();
        await world.models.characters.updateOne(
            { _id: wounded.characterId },
            {
                $set: {
                    'status.awaitingAid.since': new Date(
                        NOW.getTime() - AID_TIMEOUT_MS,
                    ),
                },
            },
        );

        await expect(rescues.timeoutAid({ aidQuestId: aid._id })).resolves.toBe(
            'resolved',
        );

        const death = await aidResultOf(wounded.characterId, aid);
        expect(death.outcome).toBe('death');
        expect(turnsOf(death)).toEqual({
            turnsTotal: 8,
            turnsCompleted: 4,
            lastTurn: 5,
            lastTurnKind: 'exploration',
        });
    });

    it('gives the rescuer the xp of the enemy groups faced up to the turn (D-12)', async () => {
        const { enemies, aid } = await dungeonAidWorld();
        const rescuer = await rescuerOn(aid);

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        const result = await resultOf(rescuer.characterId);
        expect(asStrings(result.enemies)).toEqual(
            asStrings(enemies.slice(0, 2)),
        );
        expect(result.xpGained).toBe(aid.prizes.xpPrize + 20 + 2 * 5);
    });

    it('keeps an aid without a saved turn on the plain fight (D-13)', async () => {
        const [ghoul, rat] = await fourGroups();
        const wounded = await quester({
            questOverrides: questWithEnemies('hunt', [ghoul, rat]),
        });
        scripted.willEnd('failure');
        await expect(resolve(wounded)).resolves.toBe('resolved');
        const character = await characterOf(wounded.characterId);
        const aid = await questOf(character.status.awaitingAid.aidQuest);
        expect(aid.rescue.turn).toBeUndefined();
        scripted.reset();
        dungeon.reset();
        const rescuer = await rescuerOn(aid);

        await expect(resolve(rescuer)).resolves.toBe('resolved');

        expect(dungeon.contexts).toHaveLength(0);
        expect(
            scripted.contexts.map((context) =>
                context.enemies.map(({ id, quantity }) => ({ id, quantity })),
            ),
        ).toEqual([
            asStrings([ghoul, rat]).map(({ enemy: id, quantity }) => ({
                id,
                quantity,
            })),
        ]);
        const result = await resultOf(rescuer.characterId);
        expect(result.outcome).toBe('success');
        expect(turnsOf(result)).toEqual(NO_TURNS);
    });

    // il ferito cancella il personaggio a countdown partito: l'archivio conclude l'aid avviata e lascia il soccorritore in corsia
    describe('a dungeon aid left without wounded after the start', () => {
        async function emptiedAidWorld() {
            const built = await dungeonAidWorld();
            const rescuer = await rescuerOn(built.aid);
            await world.harness.connection.transaction((session) =>
                world.harness.app
                    .get(CharacterArchiver)
                    .archiveWithinReporting(session, {
                        userId: built.wounded.player.user._id as Types.ObjectId,
                        characterId: built.wounded.characterId,
                        reason: DeletionReason.user_request,
                        now: NOW,
                    }),
            );
            const emptied = await questOf(built.aid._id);
            expect(emptied.rescue.characters).toEqual([]);
            expect(emptied.rescue.turn).toEqual(SAVED_TURN);
            return { ...built, rescuer };
        }

        it('walks the rescuer through the turns up to the saved one (C-WR-01, D-12, D-21)', async () => {
            const { enemies, aid, rescuer } = await emptiedAidWorld();

            await expect(resolve(rescuer)).resolves.toBe('resolved');

            expect(
                dungeon.contexts.map((context) => context.lastTurnIndex),
            ).toEqual([4]);
            expect(scripted.contexts).toHaveLength(2);
            const result = await resultOf(rescuer.characterId);
            expect(result.outcome).toBe('success');
            expect(turnsOf(result)).toEqual({
                turnsTotal: 8,
                turnsCompleted: 5,
                lastTurn: 5,
                lastTurnKind: 'exploration',
            });
            expect(result).toMatchObject({ stagesCleared: 2, stagesTotal: 4 });
            expect(asStrings(result.enemies)).toEqual(
                asStrings(enemies.slice(0, 2)),
            );
            expect(result.xpGained).toBe(aid.prizes.xpPrize + 20 + 2 * 5);
        });

        // 50 xp × 5/8 = 31 sull'aid; la nuova aid riscala col rapporto delle quote: 31 × 2/5 = 12, come 50 × 2/8
        it('saves the turn of the rescuer who falls on the next aid (C-WR-01, D-20, D-26)', async () => {
            const { wounded, aid, rescuer } = await emptiedAidWorld();
            expect(aid.prizes.xpPrize).toBe(31);
            scripted.willEnd('failure');

            await expect(resolve(rescuer)).resolves.toBe('resolved');

            expect(
                dungeon.contexts.map((context) => context.lastTurnIndex),
            ).toEqual([4]);
            const fallen = await resultOf(rescuer.characterId);
            expect(fallen.outcome).toBe('failure');
            expect(turnsOf(fallen)).toEqual({
                turnsTotal: 8,
                turnsCompleted: 1,
                lastTurn: 2,
                lastTurnKind: 'fight',
            });
            const rescuerAfter = await characterOf(rescuer.characterId);
            const chained = await questOf(
                rescuerAfter.status.awaitingAid.aidQuest,
            );
            expect(chained.rescue.turn).toEqual({
                index: 1,
                kind: 'fight',
                total: 8,
            });
            expect(String(chained.rescue.failedQuest)).toBe(
                String(wounded.quest._id),
            );
            expect(chained.prizes.xpPrize).toBe(12);
        });
    });

    describe('the shared prize of the rescuer', () => {
        const PRIZE_COINS = { gold: 1, silver: 0, copper: 1 };
        const potion = () =>
            persistLootItem(world.models.lootItems, {
                name: 'Pozione delle cripte',
            }) as Promise<{ _id: Types.ObjectId }>;
        const fixedPrizes = (item: Types.ObjectId) => ({
            prizeCoins: PRIZE_COINS,
            xpPrize: 80,
            prizeItem: { itemType: 'LootItem', item, quantity: 3 },
        });
        const prizeOf = (aid: any) => ({
            coins: aid.prizes.prizeCoins,
            xp: aid.prizes.xpPrize,
            item: aid.prizes.prizeItem && {
                item: String(aid.prizes.prizeItem.item),
                quantity: aid.prizes.prizeItem.quantity,
            },
        });
        const rewardOf = (result: any) => ({
            coins: result.rewards.coins,
            items: result.rewards.items.map(
                ({ item, quantity }: { item: unknown; quantity: number }) => ({
                    item: String(item),
                    quantity,
                }),
            ),
        });

        // 10001 rame × 5/8 = 6250 per difetto; xp 80 × 5/8 = 50; 3 pozioni × 5/8 = 1
        it('rescues a dungeon lost on the fifth turn with five eighths of the prize (D-14, D-20, D-30)', async () => {
            const item = await potion();
            const { wounded, aid } = await dungeonAidWorld({
                prizes: fixedPrizes(item._id),
            });
            const shared = {
                coins: { gold: 0, silver: 62, copper: 50 },
                xp: 50,
                item: { item: String(item._id), quantity: 1 },
            };
            expect(prizeOf(aid)).toEqual(shared);
            const rescuer = await rescuerOn(aid);

            await expect(resolve(rescuer)).resolves.toBe('resolved');

            expect(dungeon.contexts.map((c) => c.lastTurnIndex)).toEqual([4]);
            const result = await resultOf(rescuer.characterId);
            expect(result.outcome).toBe('success');
            expect(result.xpGained).toBe(50 + 20 + 2 * 5);
            expect(rewardOf(result)).toEqual({
                coins: shared.coins,
                items: [shared.item],
            });
            expect((await aidResultOf(wounded.characterId, aid)).outcome).toBe(
                'rescued',
            );
        });

        // 10001 rame × 1/2 = 5000 per difetto; xp 80 × 1/2 = 40; 3 pozioni × 1/2 = 1
        it('rescues a dungeon lost on the fourth turn with half of the prize (D-14, D-20, D-30)', async () => {
            const item = await potion();
            const { wounded, aid } = await dungeonAidWorld({
                failingTurn: 3,
                prizes: fixedPrizes(item._id),
            });
            const shared = {
                coins: { gold: 0, silver: 50, copper: 0 },
                xp: 40,
                item: { item: String(item._id), quantity: 1 },
            };
            expect(prizeOf(aid)).toEqual(shared);
            const rescuer = await rescuerOn(aid);

            await expect(resolve(rescuer)).resolves.toBe('resolved');

            expect(dungeon.contexts.map((c) => c.lastTurnIndex)).toEqual([3]);
            const result = await resultOf(rescuer.characterId);
            expect(result.outcome).toBe('success');
            expect(result.xpGained).toBe(40 + 20 + 2 * 5);
            expect(rewardOf(result)).toEqual({
                coins: shared.coins,
                items: [shared.item],
            });
            expect((await aidResultOf(wounded.characterId, aid)).outcome).toBe(
                'rescued',
            );
        });

        // pozione rara (soglia 0.15) e tiro 0.1: esce con quota 8/8, non con quota 4/8 (soglia 0.075)
        it('rolls the loot of a dungeon aid with the shared chances (D-20)', async () => {
            const rare = await persistLootItem(world.models.lootItems, {
                name: 'Fiala rara delle cripte',
                rarity: 'rare',
            });
            const prizes = {
                randomLoot: [
                    { itemType: 'LootItem', item: rare._id, quantity: 1 },
                ],
            };
            const enemies = await fourGroups();
            const whole = await dungeonAidWorld({
                failingTurn: 7,
                prizes,
                enemies,
            });
            const half = await dungeonAidWorld({
                failingTurn: 3,
                prizes,
                enemies,
            });
            const draws = Array.from({ length: 10 }, () => 0.1);
            const wholeRescuer = await rescuerOn(whole.aid);
            const halfRescuer = await rescuerOn(half.aid);

            chance.load(draws);
            await expect(resolve(wholeRescuer)).resolves.toBe('resolved');
            const wholeDrawn = [...chance.drawn];
            chance.load(draws);
            await expect(resolve(halfRescuer)).resolves.toBe('resolved');

            expect(chance.drawn).toEqual(wholeDrawn);
            expect(
                rewardOf(await resultOf(wholeRescuer.characterId)).items,
            ).toEqual([{ item: String(rare._id), quantity: 1 }]);
            expect(
                rewardOf(await resultOf(halfRescuer.characterId)).items,
            ).toEqual([]);
        });
    });
});
