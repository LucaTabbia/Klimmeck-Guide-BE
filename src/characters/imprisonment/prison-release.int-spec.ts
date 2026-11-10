import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    QUIET_SWEEP_CONFIG,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { QuestResolutionSweeper } from 'src/quests/outcomes/quest-resolution.sweeper';
import { PrisonReleaseService } from './prison-release.service';
import { PrisonReleaseSweeper } from './prison-release.sweeper';

const NOW = new Date('2026-11-10T20:00:00.000Z');
const ONE_MINUTE_MS = 60_000;
const before = (ms: number) => new Date(NOW.getTime() - ms);
const after = (ms: number) => new Date(NOW.getTime() + ms);

describe('prison release (replSet)', () => {
    let world: OutcomeHarness;
    let sweeper: PrisonReleaseSweeper;
    let release: PrisonReleaseService;
    let seq = 0;
    let clock: FixedClock;

    beforeAll(async () => {
        clock = new FixedClock(NOW);
        // sweeper vero: solo lo sweep periodico è spento, il test chiama sweep() a mano
        world = await createOutcomeHarness({
            clock,
            chance: new SequenceChance(),
            quiet: [QUIET_SWEEP_CONFIG],
        });
        sweeper = world.harness.app.get(PrisonReleaseSweeper);
        release = world.harness.app.get(PrisonReleaseService);
        // single-flight: attende i reconciler del boot prima del primo setup
        await sweeper.sweep();
        await world.harness.app.get(QuestResolutionSweeper).sweep();
    });

    beforeEach(async () => {
        await world.reset();
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function prisoner(
        imprisonedUntil: Date | null | undefined,
        extra: Record<string, unknown> = {},
    ): Promise<TestPlayer & { characterId: Types.ObjectId }> {
        seq += 1;
        const status =
            imprisonedUntil === undefined
                ? buildCharacter().status
                : { ...buildCharacter().status, imprisonedUntil };
        const player = await createPlayer(world.harness, {
            twitchId: `tw-prison-${seq}`,
            characterOverrides: { status, ...extra },
        });
        await registerDevice(world.harness, player);
        return {
            ...player,
            characterId: player.character!._id as Types.ObjectId,
        };
    }

    async function imprisonedUntilOf(id: Types.ObjectId): Promise<unknown> {
        const character = await world.models.characters
            .findById(id, { 'status.imprisonedUntil': 1 })
            .lean<{ status?: { imprisonedUntil?: unknown } }>()
            .exec();
        return character?.status?.imprisonedUntil;
    }

    it('releases a due prisoner and sends one prisonRelease push to the owner (quick 261110-prp)', async () => {
        const { user, characterId } = await prisoner(before(ONE_MINUTE_MS));

        await expect(sweeper.sweep()).resolves.toBe(1);

        expect(await imprisonedUntilOf(characterId)).toBeNull();
        expect(world.push.sent).toEqual([
            {
                tokens: [`tok-${String(user._id)}`],
                message: {
                    type: 'prisonRelease',
                    id: characterId.toHexString(),
                    title: 'Di nuovo libero',
                    body: "La prigionia è finita: torna all'avventura.",
                    ttlSeconds: 3600,
                },
            },
        ]);
    });

    it('notifies once per arrest across repeated sweeps (quick 261110-prp)', async () => {
        await prisoner(before(ONE_MINUTE_MS));

        await expect(sweeper.sweep()).resolves.toBe(1);
        await expect(sweeper.sweep()).resolves.toBe(0);

        expect(world.push.sent).toHaveLength(1);
    });

    it('releases at the exact release instant, like the prison guard (quick 261110-prp)', async () => {
        const { characterId } = await prisoner(NOW);

        await expect(sweeper.sweep()).resolves.toBe(1);

        expect(await imprisonedUntilOf(characterId)).toBeNull();
    });

    it('leaves a prisoner whose release is still ahead untouched (quick 261110-prp)', async () => {
        const until = after(ONE_MINUTE_MS);
        const { characterId } = await prisoner(until);

        await expect(sweeper.sweep()).resolves.toBe(0);

        expect(await imprisonedUntilOf(characterId)).toEqual(until);
        expect(world.push.sent).toEqual([]);
    });

    it('follows a release date moved by hand on the database (quick 261110-prp)', async () => {
        const { characterId } = await prisoner(before(ONE_MINUTE_MS));
        await world.models.characters
            .updateOne(
                { _id: characterId },
                { $set: { 'status.imprisonedUntil': after(ONE_MINUTE_MS) } },
            )
            .exec();

        await expect(sweeper.sweep()).resolves.toBe(0);
        clock.advanceSeconds(120);
        try {
            await expect(sweeper.sweep()).resolves.toBe(1);
        } finally {
            clock.advanceSeconds(-120);
        }

        expect(await imprisonedUntilOf(characterId)).toBeNull();
        expect(world.push.sent).toHaveLength(1);
    });

    it('ignores free characters, with the date absent or null (quick 261110-prp)', async () => {
        await prisoner(undefined);
        await prisoner(null);

        await expect(sweeper.sweep()).resolves.toBe(0);

        expect(world.push.sent).toEqual([]);
    });

    it('sends nothing for an archived prisoner and leaves it as it is (quick 261110-prp)', async () => {
        const until = before(ONE_MINUTE_MS);
        const { characterId } = await prisoner(until, { deletedAt: NOW });

        await expect(sweeper.sweep()).resolves.toBe(0);

        expect(await imprisonedUntilOf(characterId)).toEqual(until);
        expect(world.push.sent).toEqual([]);
    });

    it('answers stale without errors for a character that no longer exists (quick 261110-prp)', async () => {
        await expect(release.release(new Types.ObjectId())).resolves.toBe(
            'stale',
        );

        expect(world.push.sent).toEqual([]);
    });

    it('releases a prisoner no user plays any more without a push (quick 261110-prp)', async () => {
        const { user, characterId } = await prisoner(before(ONE_MINUTE_MS));
        await world.models.users
            .updateOne({ _id: user._id }, { $set: { currentCharacter: null } })
            .exec();

        await expect(sweeper.sweep()).resolves.toBe(1);

        expect(await imprisonedUntilOf(characterId)).toBeNull();
        expect(world.push.sent).toEqual([]);
    });

    it('lets only one of two parallel releases claim the arrest (quick 261110-prp)', async () => {
        const { characterId } = await prisoner(before(ONE_MINUTE_MS));

        const outcomes = await Promise.all([
            release.release(characterId),
            release.release(characterId),
        ]);

        expect([...outcomes].sort()).toEqual(['released', 'stale']);
        expect(world.push.sent).toHaveLength(1);
    });
});
