import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { QuestGenerationTrigger } from 'src/quests/generation/quest-generation-trigger';
import { QuestResolutionService } from 'src/quests/outcomes/quest-resolution.service';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildQuest, persistEnemy } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    QUIET_OUTCOME_OVERRIDES,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};
const ONE_SEAT = [{ title: null, count: 1 }];
const TWO_SEATS = [{ title: null, count: 2 }];

describe('regeneration after a generated quest ends (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const scripted = new ScriptedCombatResolver();
    const trigger = { request: jest.fn() };

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            combat: scripted,
            quiet: [
                ...QUIET_OUTCOME_OVERRIDES,
                { token: QuestGenerationTrigger, useValue: trigger },
            ],
        });
        service = world.harness.app.get(QuestResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
        trigger.request.mockReset();
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

    async function combatQuest(
        type: 'enemy' | 'boss',
        generated: boolean,
        seats: unknown[] = ONE_SEAT,
    ) {
        const foe = (await persistEnemy(world.models.enemies, {
            xp: 100,
        })) as { _id: Types.ObjectId };
        return {
            infos: {
                ...buildQuest().infos,
                type,
                enemies: [{ enemy: foe._id, quantity: 1 }],
            },
            requirements: {
                ...buildQuest().requirements,
                requiredAdventurers: seats,
            },
            prizes: { ...buildQuest().prizes, xpPrize: 50 },
            generated,
        };
    }

    async function quester(
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-regen-${seq}`,
            ...options,
            characterOverrides: { status: FRESH_STATUS },
        });
    }

    const resolve = (subject: Quester) =>
        service.resolveStandard({
            pendingQuestId: subject.pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });

    const concludedAtOf = async (subject: Quester) =>
        (await world.models.quests.findById(subject.quest._id).lean<any>())
            .concludedAt as Date | null;

    it('requests a run when a generated enemy quest is won (D-17)', async () => {
        const subject = await quester({
            questOverrides: await combatQuest('enemy', true),
        });

        await expect(resolve(subject)).resolves.toBe('resolved');

        expect(await concludedAtOf(subject)).toEqual(NOW);
        expect(trigger.request).toHaveBeenCalledTimes(1);
    });

    it('does not request a run for a fixed quest or a defeat (D-17)', async () => {
        const fixed = await quester({
            questOverrides: await combatQuest('enemy', false),
        });
        await expect(resolve(fixed)).resolves.toBe('resolved');
        expect(await concludedAtOf(fixed)).toEqual(NOW);

        scripted.willEnd('failure');
        const defeated = await quester({
            questOverrides: await combatQuest('enemy', true),
        });
        await expect(resolve(defeated)).resolves.toBe('resolved');
        expect(await concludedAtOf(defeated)).toBeNull();

        expect(trigger.request).not.toHaveBeenCalled();
    });

    it('requests a run when a generated boss is won by the party (D-17)', async () => {
        const first = await quester({
            questOverrides: await combatQuest('boss', true, TWO_SEATS),
        });
        const second = await quester({ quest: first.quest });

        await expect(resolve(second)).resolves.toBe('resolved');

        expect(await concludedAtOf(first)).toEqual(NOW);
        expect(
            await world.models.questResults.countDocuments({
                'quest.id': first.quest._id,
            }),
        ).toBe(2);
        expect(trigger.request).toHaveBeenCalledTimes(1);
    });
});
