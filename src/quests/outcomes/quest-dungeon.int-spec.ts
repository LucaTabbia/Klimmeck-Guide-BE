import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildQuest, persistEnemy } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { TurnFailingDungeonResolver } from '../../../test/quests/turn-failing-dungeon-resolver';
import type { ChanceSource } from './chance-source';
import {
    type DungeonContext,
    type DungeonResolution,
    DungeonResolver,
} from './dungeon/dungeon-resolver';
import { PlaceholderDungeonResolver } from './dungeon/placeholder-dungeon-resolver';
import { QuestResolutionService } from './quest-resolution.service';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const QUEST_TITLE = 'Le cripte di Bosa';
const NO_COINS = { gold: 0, silver: 0, copper: 0 };
const PRIZE_COINS = { gold: 0, silver: 2, copper: 0 };
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: NO_COINS,
};
const ONE_SEAT = [{ title: null, count: 1 }];

type EnemyEntry = { enemy: Types.ObjectId; quantity: number };

// l'harness accetta solo useValue: la porta della dungeon si sostituisce per caso, il segnaposto reale resta il default
class SwappableDungeonResolver extends DungeonResolver {
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
    }

    explore(context: DungeonContext, chance: ChanceSource): DungeonResolution {
        return this.current.explore(context, chance);
    }
}

// la dungeon passa dal segnaposto reale del modulo (DungeonResolver), che gioca una tappa per voce sulla porta di combattimento scriptata (D-12)
describe('QuestResolutionService.resolveStandard (individual) with a staged dungeon (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
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
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
        dungeon.reset();
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

    async function enemy(
        name: string,
        xp: number,
        relatedLore: Types.ObjectId[] = [],
    ) {
        return (await persistEnemy(world.models.enemies, {
            name,
            xp,
            lifePoints: 200,
            relatedLore,
        })) as { _id: Types.ObjectId };
    }

    // una pagina per tappa, solo se richieste
    async function threeStages(
        lore: Types.ObjectId[] = [],
    ): Promise<EnemyEntry[]> {
        const pagesOf = (index: number) => (lore[index] ? [lore[index]] : []);
        const ghoul = await enemy('Ghoul', 20, pagesOf(0));
        const rat = await enemy('Ratto delle cripte', 5, pagesOf(1));
        const lich = await enemy('Custode delle ossa', 120, pagesOf(2));
        return [
            { enemy: ghoul._id, quantity: 1 },
            { enemy: rat._id, quantity: 2 },
            { enemy: lich._id, quantity: 1 },
        ];
    }

    function questWithEnemies(type: string, enemies: EnemyEntry[]) {
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
            prizes: {
                ...buildQuest().prizes,
                xpPrize: 50,
                prizeCoins: PRIZE_COINS,
            },
        };
    }

    async function explorer(
        type: string,
        enemies: EnemyEntry[],
    ): Promise<Quester> {
        seq += 1;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-dungeon-${seq}`,
            questOverrides: questWithEnemies(type, enemies),
            characterOverrides: { status: FRESH_STATUS },
        });
        await registerDevice(world.harness, created.player);
        return created;
    }

    // la tappa k (1-based) è il k-esimo contesto ricevuto dalla porta di combattimento
    const losingFrom = (stage: number) =>
        scripted.willEndBy(() =>
            scripted.contexts.length >= stage ? 'failure' : 'success',
        );

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

    const enemiesOf = (holder: { enemies?: EnemyEntry[] }) =>
        (holder.enemies ?? []).map(({ enemy: ref, quantity }) => ({
            enemy: String(ref),
            quantity,
        }));

    const asStrings = (entries: EnemyEntry[]) =>
        entries.map(({ enemy: ref, quantity }) => ({
            enemy: String(ref),
            quantity,
        }));

    it('explores every stage and rewards only at the end (D-12)', async () => {
        const enemies = await threeStages();
        const subject = await explorer('dungeon', enemies);

        await expect(resolve(subject)).resolves.toBe('resolved');

        const result = await resultOf(subject);
        expect(result).toMatchObject({
            outcome: 'success',
            stagesCleared: 3,
            stagesTotal: 3,
            xpGained: 50 + 20 + 2 * 5 + 120,
        });
        expect(enemiesOf(result)).toEqual(asStrings(enemies));
        expect(result.rewards.coins).toEqual(PRIZE_COINS);
        const character = await characterOf(subject);
        expect(character.status.coins).toEqual(PRIZE_COINS);
        expect(character.status.awaitingAid ?? null).toBeNull();
        expect(
            scripted.contexts.map((context) =>
                context.enemies.map(({ id, quantity }) => ({ id, quantity })),
            ),
        ).toEqual(
            enemies.map(({ enemy: ref, quantity }) => [
                { id: String(ref), quantity },
            ]),
        );
    });

    const threePages = () => [0, 1, 2].map(() => new Types.ObjectId());
    const hexes = (ids: unknown[] | undefined) => (ids ?? []).map(String);

    it('teaches every enemy of a cleared dungeon (D-06)', async () => {
        const lore = threePages();
        const enemies = await threeStages(lore);
        const subject = await explorer('dungeon', enemies);

        await expect(resolve(subject)).resolves.toBe('resolved');

        const character = await characterOf(subject);
        expect(hexes(character.status.unlockedLore)).toEqual(hexes(lore));
        expect(hexes(character.status.knownEnemies)).toEqual(
            hexes(enemies.map(({ enemy: ref }) => ref)),
        );
        const result = await resultOf(subject);
        expect(hexes(result.loreUnlocked)).toEqual(hexes(lore));
    });

    it('stops at the first defeat and opens an aid with the same enemies, teaching nothing (D-12, D-06)', async () => {
        const enemies = await threeStages(threePages());
        const subject = await explorer('dungeon', enemies);
        losingFrom(2);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(scripted.contexts).toHaveLength(2);
        const result = await resultOf(subject);
        expect(result).toMatchObject({
            outcome: 'failure',
            stagesCleared: 1,
            stagesTotal: 3,
            xpGained: 0,
        });
        expect(result.rewards).toEqual({
            coins: NO_COINS,
            items: [],
            pet: null,
        });
        const character = await characterOf(subject);
        expect(character.status.coins).toEqual(NO_COINS);
        const { awaitingAid } = character.status;
        expect(String(awaitingAid.quest)).toBe(String(subject.quest._id));
        const aid = await questOf(awaitingAid.aidQuest);
        expect(aid.infos.type).toBe('aid');
        expect(enemiesOf(aid.infos)).toEqual(asStrings(enemies));
        expect(character.status.unlockedLore).toEqual([]);
        expect(character.status.knownEnemies).toEqual([]);
        expect(result.loreUnlocked).toEqual([]);
        expect(aid.rescue.turn).toEqual({ index: 3, kind: 'fight', total: 6 });
    });

    const turnsOf = (result: Record<string, unknown>) => ({
        turnsTotal: result.turnsTotal,
        turnsCompleted: result.turnsCompleted,
        lastTurn: result.lastTurn,
        lastTurnKind: result.lastTurnKind,
    });

    const aidOf = async (subject: Quester) => {
        const character = await characterOf(subject);
        return questOf(character.status.awaitingAid.aidQuest);
    };

    it('saves the fight turn of the defeat on the aid (D-12)', async () => {
        const [ghoul, rat] = await threeStages();
        const subject = await explorer('dungeon', [ghoul, rat]);
        losingFrom(2);

        await expect(resolve(subject)).resolves.toBe('resolved');

        const aid = await aidOf(subject);
        expect(aid.rescue.turn).toEqual({ index: 3, kind: 'fight', total: 4 });
        const result = await resultOf(subject);
        expect(turnsOf(result)).toEqual({
            turnsTotal: 4,
            turnsCompleted: 3,
            lastTurn: 4,
            lastTurnKind: 'fight',
        });
        expect(result).toMatchObject({ stagesCleared: 1, stagesTotal: 2 });
    });

    it('saves an exploration turn of the defeat on the aid (D-12, D-13)', async () => {
        const stages = await threeStages();
        const wraith = await enemy('Spettro del pozzo', 40);
        const subject = await explorer('dungeon', [
            ...stages,
            { enemy: wraith._id, quantity: 1 },
        ]);
        dungeon.use(new TurnFailingDungeonResolver(dungeon.placeholder, [4]));

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(scripted.contexts).toHaveLength(2);
        const aid = await aidOf(subject);
        expect(aid.rescue.turn).toEqual({
            index: 4,
            kind: 'exploration',
            total: 8,
        });
        const result = await resultOf(subject);
        expect(result.outcome).toBe('failure');
        expect(turnsOf(result)).toEqual({
            turnsTotal: 8,
            turnsCompleted: 4,
            lastTurn: 5,
            lastTurnKind: 'exploration',
        });
        expect(result).toMatchObject({ stagesCleared: 2, stagesTotal: 4 });
    });

    it('writes the turn counters of a cleared dungeon (D-21)', async () => {
        const enemies = await threeStages();
        const subject = await explorer('dungeon', enemies);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(turnsOf(await resultOf(subject))).toEqual({
            turnsTotal: 6,
            turnsCompleted: 6,
            lastTurn: 6,
            lastTurnKind: 'fight',
        });
    });

    it('starts the second stage from the hp left by the first (D-12)', async () => {
        const enemies = await threeStages();
        const subject = await explorer('dungeon', enemies);
        scripted.willResolve(subject.characterId, { hpAfter: 600 });

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(
            scripted.contexts.map(
                ({ participants }) => participants[0].currentLifePoints,
            ),
        ).toEqual([1000, 600, 600]);
        const character = await characterOf(subject);
        expect(character.status.currentLifePoints).toBe(600);
    });

    it('keeps the stages null for an enemy quest (D-12)', async () => {
        const [first] = await threeStages();
        const subject = await explorer('enemy', [first]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(scripted.contexts).toHaveLength(1);
        const result = await resultOf(subject);
        expect(result).toMatchObject({
            outcome: 'success',
            stagesCleared: null,
            stagesTotal: null,
        });
    });

    it('keeps the turn counters null for an enemy quest (D-21)', async () => {
        const [first] = await threeStages();
        const subject = await explorer('enemy', [first]);

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(turnsOf(await resultOf(subject))).toEqual({
            turnsTotal: null,
            turnsCompleted: null,
            lastTurn: null,
            lastTurnKind: null,
        });
    });
});
