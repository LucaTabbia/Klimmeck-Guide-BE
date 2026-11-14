import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter, persistPet } from '../../../test/fixtures';
import {
    buildOwnedPet,
    type OwnedPetOverrides,
} from '../../../test/fixtures/owned-pet.fixture';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    QUIET_SWEEP_CONFIG,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { PrisonReleaseSweeper } from 'src/characters/imprisonment/prison-release.sweeper';
import { QuestResolutionSweeper } from 'src/quests/outcomes/quest-resolution.sweeper';
import { PetRecoveryService } from './pet-recovery.service';
import { PetRecoverySweeper } from './pet-recovery.sweeper';

const T0 = new Date('2026-11-14T12:00:00.000Z');
const RECOVERY_TIME_MS = 60 * 60 * 1000;
const BACK_IN_FORCE = new Date(T0.getTime() + RECOVERY_TIME_MS);
const WORG = {
    name: 'Worg',
    maxLifePoints: 100,
    maxXp: 100,
    recoveryTime: RECOVERY_TIME_MS,
};
const HORSE = { ...WORG, name: 'Cavallo' };
const DEFEATED_FENRIR: OwnedPetOverrides = {
    name: 'Fenrir',
    currentLifePoints: 1,
    level: 1,
    lifeAsOf: T0,
    defeatedUntil: BACK_IN_FORCE,
};

type Owner = TestPlayer & { characterId: Types.ObjectId };

describe('companion recovery push (replSet)', () => {
    let world: OutcomeHarness;
    let sweeper: PetRecoverySweeper;
    let service: PetRecoveryService;
    let seq = 0;
    const clock = new FixedClock(T0);

    beforeAll(async () => {
        // sweeper vero: solo lo sweep periodico è spento, il test chiama sweep() a mano
        world = await createOutcomeHarness({
            clock,
            chance: new SequenceChance(),
            quiet: [QUIET_SWEEP_CONFIG],
        });
        sweeper = world.harness.app.get(PetRecoverySweeper);
        service = world.harness.app.get(PetRecoveryService);
        // single-flight: attende i reconciler del boot prima del primo setup
        await sweeper.sweep();
        await world.harness.app.get(PrisonReleaseSweeper).sweep();
        await world.harness.app.get(QuestResolutionSweeper).sweep();
    });

    beforeEach(async () => {
        await world.reset();
        setClockTo(BACK_IN_FORCE);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    function setClockTo(at: Date): void {
        clock.advanceSeconds((at.getTime() - clock.now().getTime()) / 1000);
    }

    async function catalogued(
        species: Record<string, unknown> = WORG,
    ): Promise<Types.ObjectId> {
        const pet = await persistPet(world.models.pets, species);
        return pet._id as Types.ObjectId;
    }

    async function ownerWith(
        ownedPets: unknown[],
        pet: Types.ObjectId | null = null,
    ): Promise<Owner> {
        seq += 1;
        const player = await createPlayer(world.harness, {
            twitchId: `tw-pet-recovery-${seq}`,
            characterOverrides: {
                assets: { ...buildCharacter().assets, pet, ownedPets },
            },
        });
        await registerDevice(world.harness, player);
        return {
            ...player,
            characterId: player.character!._id as Types.ObjectId,
        };
    }

    async function ownedPetsOf(id: Types.ObjectId): Promise<unknown[]> {
        const character = await world.models.characters.collection.findOne(
            { _id: id },
            { projection: { 'assets.ownedPets': 1 } },
        );
        return (character?.assets?.ownedPets ?? []) as unknown[];
    }

    const recoveryPush = (
        user: TestPlayer['user'],
        petId: Types.ObjectId,
        body: string,
    ) => ({
        tokens: [`tok-${String(user._id)}`],
        message: {
            type: 'petRecovered',
            id: petId.toHexString(),
            title: 'Di nuovo in forze',
            body,
            ttlSeconds: 3600,
        },
    });

    it('pushes once when a defeated companion is back to full life (D-11, D-20)', async () => {
        const worg = await catalogued();
        const { user, characterId } = await ownerWith([
            buildOwnedPet(worg, DEFEATED_FENRIR),
        ]);

        await expect(sweeper.sweep()).resolves.toBe(1);
        await expect(sweeper.sweep()).resolves.toBe(0);

        expect(world.push.sent).toEqual([
            recoveryPush(user, worg, 'Fenrir è di nuovo in forze'),
        ]);
        expect(await ownedPetsOf(characterId)).toEqual([
            { ...buildOwnedPet(worg, DEFEATED_FENRIR), defeatedUntil: null },
        ]);
    });

    it('does not push before the full-life date (D-11)', async () => {
        const worg = await catalogued();
        const { characterId } = await ownerWith([
            buildOwnedPet(worg, DEFEATED_FENRIR),
        ]);
        setClockTo(new Date(BACK_IN_FORCE.getTime() - 1000));

        await expect(sweeper.sweep()).resolves.toBe(0);

        expect(world.push.sent).toEqual([]);
        expect(await ownedPetsOf(characterId)).toEqual([
            buildOwnedPet(worg, DEFEATED_FENRIR),
        ]);
    });

    it('pushes once for two concurrent claims on the same companion (D-24)', async () => {
        const worg = await catalogued();
        const { characterId } = await ownerWith([
            buildOwnedPet(worg, DEFEATED_FENRIR),
        ]);

        const claimed = await Promise.all([
            service.release(characterId),
            service.release(characterId),
        ]);

        expect(claimed.flat().map(String)).toEqual([String(worg)]);
        expect(world.push.sent).toHaveLength(1);
    });

    it('sends no push for a companion sold before the sweep (D-11)', async () => {
        const worg = await catalogued();
        const { characterId } = await ownerWith([
            buildOwnedPet(worg, DEFEATED_FENRIR),
        ]);
        await world.models.characters
            .updateOne(
                { _id: characterId },
                { $set: { 'assets.ownedPets': [] } },
            )
            .exec();

        await expect(service.release(characterId)).resolves.toEqual([]);

        expect(world.push.sent).toEqual([]);
        expect(await ownedPetsOf(characterId)).toEqual([]);
    });

    it('still pushes for a companion equipped again after its date and leaves its life alone (D-24, Pitfall 6)', async () => {
        const worg = await catalogued();
        const wounded = buildOwnedPet(worg, {
            name: 'Fenrir',
            currentLifePoints: 50,
            level: 1,
            defeatedUntil: BACK_IN_FORCE,
        });
        const { user, characterId } = await ownerWith([wounded], worg);

        await expect(sweeper.sweep()).resolves.toBe(1);

        expect(world.push.sent).toEqual([
            recoveryPush(user, worg, 'Fenrir è di nuovo in forze'),
        ]);
        expect(await ownedPetsOf(characterId)).toEqual([
            { ...wounded, defeatedUntil: null },
        ]);
    });

    it('uses the species name for a companion without a name (D-20)', async () => {
        const worg = await catalogued();
        const { user } = await ownerWith([
            buildOwnedPet(worg, { ...DEFEATED_FENRIR, name: undefined }),
        ]);

        await expect(sweeper.sweep()).resolves.toBe(1);

        expect(world.push.sent).toEqual([
            recoveryPush(user, worg, 'Worg è di nuovo in forze'),
        ]);
    });

    it('never pushes for a hurt companion that finishes resting (D-11)', async () => {
        const worg = await catalogued();
        await ownerWith([
            buildOwnedPet(worg, {
                name: 'Fenrir',
                currentLifePoints: 20,
                level: 1,
                lifeAsOf: T0,
            }),
        ]);

        await expect(sweeper.sweep()).resolves.toBe(0);

        expect(world.push.sent).toEqual([]);
    });

    it('reports only the companions it actually claimed (D-24)', async () => {
        const worg = await catalogued();
        const horse = await catalogued(HORSE);
        const { characterId } = await ownerWith([
            buildOwnedPet(worg, DEFEATED_FENRIR),
            buildOwnedPet(horse, { ...DEFEATED_FENRIR, name: 'Bucefalo' }),
        ]);
        await world.models.characters.collection.updateOne(
            { _id: characterId },
            { $set: { 'assets.ownedPets.0.defeatedUntil': null } },
        );

        const claimed = await service.release(characterId);

        expect(claimed.map(String)).toEqual([String(horse)]);
        expect(world.push.sent).toHaveLength(1);
    });

    // la FE deduplica per tipo e id in una finestra di 2 minuti (FE W-9): id = pet a catalogo, mai il personaggio
    it('gives two companions of the same character back in force together two distinct pushes (D-11, D-20)', async () => {
        const worg = await catalogued();
        const horse = await catalogued(HORSE);
        const { user, characterId } = await ownerWith([
            buildOwnedPet(worg, DEFEATED_FENRIR),
            buildOwnedPet(horse, { ...DEFEATED_FENRIR, name: undefined }),
        ]);

        await expect(sweeper.sweep()).resolves.toBe(2);

        expect(world.push.sent).toEqual([
            recoveryPush(user, worg, 'Fenrir è di nuovo in forze'),
            recoveryPush(user, horse, 'Cavallo è di nuovo in forze'),
        ]);
        const ids = world.push.sent.map(({ message }) => message.id);
        expect(new Set(ids).size).toBe(2);
        expect(ids).not.toContain(characterId.toHexString());
    });
});
