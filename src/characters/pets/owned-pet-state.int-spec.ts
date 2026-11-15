import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import { Pet, PetDocument } from 'src/models/pet.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter, persistPet } from '../../../test/fixtures';
import {
    buildOwnedPet,
    type OwnedPetOverrides,
    type OwnedPetSeed,
} from '../../../test/fixtures/owned-pet.fixture';

const MINUTE_SECONDS = 60;
const MINUTE_MS = 60_000;
const RECOVERY_TIME_MS = 100 * MINUTE_MS;
const t0 = new Date('2026-11-14T10:00:00.000Z');

const COMPANIONS = `query($id: String!) { character(id: $id) { assets { pet { id } ownedPets { currentLifePoints defeated fullLifeAt level lifeAsOf maxLifePoints name potionRecoveryUntil xp pet { id maxLifePoints recoveryTime } } } } }`;

interface WireCompanion {
    currentLifePoints: number;
    defeated: boolean;
    fullLifeAt: string | null;
    level: number;
    lifeAsOf: string | null;
    maxLifePoints: number;
    name: string | null;
    potionRecoveryUntil: string | null;
    xp: number;
    pet: { id: string; maxLifePoints: number; recoveryTime: number | null };
}

interface WireBody {
    data?: {
        character?: {
            assets: { pet: { id: string } | null; ownedPets: WireCompanion[] };
        };
    } | null;
    errors?: { message: string }[];
}

const isoAfter = (ms: number): string =>
    new Date(t0.getTime() + ms).toISOString();

describe('companion state on the wire', () => {
    let harness: AuthTestApp;
    let clock: FixedClock;
    let pets: Model<PetDocument>;

    beforeAll(async () => {
        clock = new FixedClock(t0);
        harness = await createCharactersTestApp({ clock });
        pets = harness.connection.model<PetDocument>(Pet.name);
    });

    beforeEach(() => {
        setClockTo(0);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    function setClockTo(minutesAfterT0: number): void {
        const elapsed = clock.now().getTime() - t0.getTime();
        clock.advanceSeconds(minutesAfterT0 * MINUTE_SECONDS - elapsed / 1000);
    }

    async function speciesId(
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const pet = await persistPet(pets, {
            name: 'Lupo',
            maxLifePoints: 100,
            maxXp: 100,
            recoveryTime: RECOVERY_TIME_MS,
            ...overrides,
        });
        return pet._id as Types.ObjectId;
    }

    let ownerCount = 0;

    async function ownerOf(
        ownedPets: OwnedPetSeed[],
        equipped: Types.ObjectId | null = null,
    ): Promise<TestPlayer> {
        ownerCount += 1;
        return createPlayer(harness, {
            twitchId: `owned-pet-state-${ownerCount}`,
            characterOverrides: {
                assets: {
                    ...buildCharacter().assets,
                    ownedPets,
                    pet: equipped,
                },
            },
        });
    }

    async function companionsOf(player: TestPlayer): Promise<WireCompanion[]> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            COMPANIONS,
            { id: String(player.character?._id) },
            player.bearer,
        );
        const body = response.body as WireBody;
        expect(body.errors).toBeUndefined();
        return body.data?.character?.assets.ownedPets ?? [];
    }

    async function onlyCompanion(
        overrides: OwnedPetOverrides,
        options: { equipped?: boolean; species?: Record<string, unknown> } = {},
    ): Promise<WireCompanion> {
        const pet = await speciesId(options.species);
        const player = await ownerOf(
            [buildOwnedPet(pet, overrides)],
            options.equipped ? pet : null,
        );
        const [companion] = await companionsOf(player);
        return companion;
    }

    it('serves a resting companion with the dates to interpolate (D-04, D-24)', async () => {
        setClockTo(20);

        const companion = await onlyCompanion({
            currentLifePoints: 20,
            lifeAsOf: t0,
            level: 1,
        });

        expect(companion).toMatchObject({
            currentLifePoints: 20,
            lifeAsOf: t0.toISOString(),
            fullLifeAt: isoAfter(Math.ceil((80 * RECOVERY_TIME_MS) / 99)),
            defeated: false,
            maxLifePoints: 100,
        });
    });

    it('serves a defeated companion as defeated until its full-life date even before the sweeper (D-02, D-24)', async () => {
        setClockTo(10);
        const pet = await speciesId();
        const player = await ownerOf([
            buildOwnedPet(pet, {
                currentLifePoints: 1,
                lifeAsOf: t0,
                defeatedUntil: new Date(t0.getTime() + RECOVERY_TIME_MS),
                level: 1,
            }),
        ]);

        const [defeated] = await companionsOf(player);
        expect(defeated).toMatchObject({
            defeated: true,
            currentLifePoints: 1,
            lifeAsOf: t0.toISOString(),
            fullLifeAt: isoAfter(RECOVERY_TIME_MS),
        });

        setClockTo(101);
        const [recovered] = await companionsOf(player);
        expect(recovered).toMatchObject({
            defeated: false,
            currentLifePoints: 100,
            lifeAsOf: null,
            fullLifeAt: null,
        });
    });

    it('serves the equipped companion with no dates (D-04)', async () => {
        setClockTo(20);

        const companion = await onlyCompanion(
            { currentLifePoints: 40, level: 1 },
            { equipped: true },
        );

        expect(companion).toMatchObject({
            currentLifePoints: 40,
            lifeAsOf: null,
            fullLifeAt: null,
            defeated: false,
            potionRecoveryUntil: null,
        });
    });

    it('serves a legacy entry and a pet without a recovery time as full life (D-23, D-25)', async () => {
        setClockTo(20);
        const legacyPet = await speciesId();
        const uncuratedPet = await speciesId({ recoveryTime: null });
        const player = await ownerOf([
            buildOwnedPet(legacyPet, { currentLifePoints: 0 }),
            buildOwnedPet(uncuratedPet, {
                currentLifePoints: 20,
                lifeAsOf: t0,
                level: 1,
            }),
        ]);

        const [legacy, uncurated] = await companionsOf(player);

        expect(legacy).toMatchObject({
            currentLifePoints: 100,
            lifeAsOf: null,
            fullLifeAt: null,
        });
        expect(uncurated).toMatchObject({
            currentLifePoints: 100,
            lifeAsOf: null,
            fullLifeAt: null,
            pet: { recoveryTime: null },
        });
    });

    it('serves the name of a named companion and null otherwise (D-18)', async () => {
        const named = await speciesId();
        const unnamed = await speciesId();
        const player = await ownerOf([
            buildOwnedPet(named, { name: 'Fulmine', level: 1 }),
            buildOwnedPet(unnamed, { level: 1 }),
        ]);

        const companions = await companionsOf(player);

        expect(companions.map((companion) => companion.name)).toEqual([
            'Fulmine',
            null,
        ]);
    });

    it('serves the level and the maximum life of a companion with xp (D-37)', async () => {
        const companion = await onlyCompanion(
            { xp: 62, currentLifePoints: 150, level: 8 },
            { equipped: true },
        );

        expect(companion).toMatchObject({
            level: 8,
            maxLifePoints: 162,
            currentLifePoints: 150,
            pet: { maxLifePoints: 100 },
        });
    });

    it('interpolates the rest up to the maximum of the companion level (D-38)', async () => {
        setClockTo(10);

        const companion = await onlyCompanion({
            xp: 100,
            level: 10,
            currentLifePoints: 101,
            lifeAsOf: t0,
        });

        expect(companion).toMatchObject({
            level: 10,
            maxLifePoints: 200,
            currentLifePoints: 101,
            lifeAsOf: t0.toISOString(),
            fullLifeAt: isoAfter(Math.ceil((99 * RECOVERY_TIME_MS) / 199)),
        });
    });

    it('serves level 1 and the base life for a pet with an invalid xp cap (D-38)', async () => {
        const companion = await onlyCompanion(
            { xp: 50, currentLifePoints: 0 },
            { species: { maxXp: 0 } },
        );

        expect(companion).toMatchObject({
            level: 1,
            maxLifePoints: 100,
            currentLifePoints: 100,
        });
    });

    it('serves an entry never touched by the phase at full life at its maximum (D-23, D-38)', async () => {
        setClockTo(20);
        const equippedPet = await speciesId();
        const restingPet = await speciesId();
        const phase19Entry = { xp: 22, currentLifePoints: 100 };
        const player = await ownerOf(
            [
                buildOwnedPet(equippedPet, phase19Entry),
                buildOwnedPet(restingPet, phase19Entry),
            ],
            equippedPet,
        );

        const companions = await companionsOf(player);

        const atFullLife = {
            level: 5,
            currentLifePoints: 122,
            maxLifePoints: 122,
            lifeAsOf: null,
            fullLifeAt: null,
        };
        expect(companions).toMatchObject([atFullLife, atFullLife]);
    });

    it('keeps the saved life of an entry with a level and no anchor (D-23, D-38)', async () => {
        const companion = await onlyCompanion(
            { level: 5, xp: 22, currentLifePoints: 100 },
            { equipped: true },
        );

        expect(companion).toMatchObject({
            currentLifePoints: 100,
            maxLifePoints: 122,
        });
    });

    it('serves the saved level and the life derived from it (D-39)', async () => {
        const companion = await onlyCompanion(
            { level: 4, xp: 0, currentLifePoints: 50 },
            { equipped: true },
        );

        expect(companion).toMatchObject({ level: 4, maxLifePoints: 113 });
    });

    it('recomputes the level of an entry saved before the levels (D-39)', async () => {
        const companion = await onlyCompanion(
            { xp: 47, currentLifePoints: 0 },
            { equipped: true },
        );

        expect(companion).toMatchObject({
            level: 7,
            maxLifePoints: 147,
            currentLifePoints: 147,
        });
    });
});
