import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter, persistPet } from '../../../test/fixtures';
import {
    buildOwnedPet,
    type OwnedPetSeed,
} from '../../../test/fixtures/owned-pet.fixture';
import { buildActiveTravelDoc } from '../../../test/travel/active-travel.fixture';

const EQUIP_PET =
    'mutation($request: EquipPetRequest!) { equipPet(request: $request) { successful response } }';
const UNEQUIP_PET =
    'mutation($request: UnequipPetRequest!) { unequipPet(request: $request) { successful response } }';
const COMPANION =
    'query($id: String!) { character(id: $id) { assets { pet { id name } } } }';
const EQUIPPED = { successful: true, response: 'Compagno equipaggiato' };
const UNEQUIPPED = { successful: true, response: 'Compagno lasciato a riposo' };
const MINUTE_SECONDS = 60;
const MINUTE_MS = 60_000;
const RECOVERY_TIME_MS = 100 * MINUTE_MS;
const HOUR_MS = 3_600_000;
const t0 = new Date('2026-11-14T10:00:00.000Z');

const at = (minutes: number): Date =>
    new Date(t0.getTime() + minutes * MINUTE_MS);

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface RawCharacter {
    assets: { pet: unknown; ownedPets: unknown[] };
    status: { activeTravel?: unknown };
}

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

describe('equipPet / unequipPet (wire)', () => {
    let harness: AuthTestApp;
    let clock: FixedClock;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let pets: Model<PetDocument>;
    let horse: PetDocument;
    let cat: PetDocument;
    let wolf: PetDocument;
    let horseId: Types.ObjectId;
    let catId: Types.ObjectId;
    let wolfId: Types.ObjectId;

    function setClockTo(minutesAfterT0: number): void {
        const elapsed = clock.now().getTime() - t0.getTime();
        clock.advanceSeconds(minutesAfterT0 * MINUTE_SECONDS - elapsed / 1000);
    }

    function idOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    function ownerOf(
        twitchId: string,
        ownedPets: OwnedPetSeed[],
        overrides: Record<string, unknown> = {},
    ): Promise<TestPlayer> {
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                assets: { ...buildCharacter().assets, ownedPets },
                ...overrides,
            },
        });
    }

    async function rawCharacter(player: TestPlayer): Promise<RawCharacter> {
        return (await characters.collection.findOne({
            _id: new Types.ObjectId(idOf(player)),
        })) as unknown as RawCharacter;
    }

    async function send(
        document: string,
        variables: Record<string, unknown>,
        bearer: string,
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            document,
            variables,
            bearer,
        );
        return response.body as WireBody;
    }

    function equip(
        player: TestPlayer,
        pet: PetDocument,
        bearer = player.bearer,
    ): Promise<WireBody> {
        return send(
            EQUIP_PET,
            {
                request: {
                    id: idOf(player),
                    petId: String(pet._id as Types.ObjectId),
                },
            },
            bearer,
        );
    }

    function unequip(player: TestPlayer): Promise<WireBody> {
        return send(
            UNEQUIP_PET,
            { request: { id: idOf(player) } },
            player.bearer,
        );
    }

    async function lockedOwnerOf(
        twitchId: string,
        ownedPets: OwnedPetSeed[],
    ): Promise<TestPlayer> {
        const draft = await pendingQuests.create({
            startDate: null,
            waitingTime: HOUR_MS,
            pointsSpent: 0,
            quest: new Types.ObjectId(),
            missionDraftStartedAt: t0,
        });
        return ownerOf(twitchId, ownedPets, {
            quests: {
                ...buildCharacter().quests,
                [QuestLane.story]: draft._id,
            },
        });
    }

    beforeAll(async () => {
        clock = new FixedClock(t0);
        harness = await createCharactersTestApp({ clock });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        pets = harness.connection.model<PetDocument>(Pet.name);
    });

    beforeEach(async () => {
        setClockTo(0);
        horse = await persistPet(pets, {
            name: 'Cavallo da viaggio',
            speedModifier: 2,
        });
        cat = await persistPet(pets, { name: 'Gatto', speedModifier: null });
        wolf = await persistPet(pets, {
            name: 'Lupo',
            maxLifePoints: 100,
            maxXp: 100,
            recoveryTime: RECOVERY_TIME_MS,
        });
        horseId = horse._id as Types.ObjectId;
        catId = cat._id as Types.ObjectId;
        wolfId = wolf._id as Types.ObjectId;
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('equips an owned pet as the companion (D-15)', async () => {
        const player = await ownerOf('twitch-pet-owned', [
            buildOwnedPet(horseId),
        ]);

        const body = await equip(player, horse);

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipPet).toEqual(EQUIPPED);
        expect((await rawCharacter(player)).assets.pet).toEqual(horseId);
        const companion = await send(
            COMPANION,
            { id: idOf(player) },
            player.bearer,
        );
        expect(companion.data?.character).toEqual({
            assets: {
                pet: { id: horseId.toHexString(), name: 'Cavallo da viaggio' },
            },
        });
    });

    it('stays idempotent when equipping twice (D-15)', async () => {
        const player = await ownerOf('twitch-pet-twice', [
            buildOwnedPet(horseId),
        ]);

        await equip(player, horse);
        const body = await equip(player, horse);

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipPet).toEqual(EQUIPPED);
        expect((await rawCharacter(player)).assets.pet).toEqual(horseId);
    });

    it('equips a pet owned as an entry and keeps the state of a full companion (D-03, D-04)', async () => {
        const entry = buildOwnedPet(horseId, {
            xp: 12,
            currentLifePoints: 10,
            level: 2,
        });
        const player = await ownerOf('twitch-pet-entry', [
            buildOwnedPet(catId),
            entry,
        ]);

        const body = await equip(player, horse);

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipPet).toEqual(EQUIPPED);
        expect((await rawCharacter(player)).assets).toMatchObject({
            pet: horseId,
            ownedPets: [buildOwnedPet(catId), entry],
        });
    });

    it('refuses a pet that is not in any entry with PET_NOT_OWNED and writes nothing (D-03)', async () => {
        const player = await ownerOf('twitch-pet-unowned', [
            buildOwnedPet(catId),
        ]);
        const before = await rawCharacter(player);

        const body = await equip(player, horse);

        expect(codeOf(body)).toBe('PET_NOT_OWNED');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('unequips the companion idempotently (D-15)', async () => {
        const player = await ownerOf('twitch-pet-unequip', [
            buildOwnedPet(horseId),
        ]);
        await equip(player, horse);

        const first = await unequip(player);
        const second = await unequip(player);

        expect(first.data?.unequipPet).toEqual(UNEQUIPPED);
        expect(second.data?.unequipPet).toEqual(UNEQUIPPED);
        const raw = await rawCharacter(player);
        expect(raw.assets.pet).toBeNull();
        expect(raw.assets.ownedPets).toEqual([
            buildOwnedPet(horseId, { level: 1, lifeAsOf: t0 }),
        ]);
    });

    it('equips during a travel without changing the travel (D-15)', async () => {
        const player = await ownerOf(
            'twitch-pet-travel',
            [buildOwnedPet(horseId)],
            {
                status: {
                    ...buildCharacter().status,
                    activeTravel: buildActiveTravelDoc(),
                },
            },
        );
        const before = (await rawCharacter(player)).status.activeTravel;

        const body = await equip(player, horse);

        expect(body.errors).toBeUndefined();
        const raw = await rawCharacter(player);
        expect(raw.assets.pet).toEqual(horseId);
        expect(raw.status.activeTravel).toEqual(before);
    });

    it('equips a companion that is not a mount (D-15)', async () => {
        const player = await ownerOf('twitch-pet-cat', [buildOwnedPet(catId)]);

        const body = await equip(player, cat);

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipPet).toEqual(EQUIPPED);
        expect((await rawCharacter(player)).assets.pet).toEqual(catId);
    });

    it('lets the innkeeper equip for a character (D-15, C1)', async () => {
        const player = await ownerOf('twitch-pet-owner', [
            buildOwnedPet(horseId),
        ]);
        const oste = await createPlayer(harness, {
            twitchId: 'twitch-pet-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });

        const body = await equip(player, horse, oste.bearer);

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipPet).toEqual(EQUIPPED);
        expect((await rawCharacter(player)).assets.pet).toEqual(horseId);
    });

    it('refuses a defeated companion with PET_DEFEATED and writes nothing (D-02)', async () => {
        setClockTo(50);
        const player = await ownerOf('twitch-pet-defeated', [
            buildOwnedPet(wolfId, {
                currentLifePoints: 1,
                lifeAsOf: at(0),
                defeatedUntil: at(100),
                level: 1,
            }),
        ]);
        const before = await rawCharacter(player);

        const body = await equip(player, wolf);

        expect(codeOf(body)).toBe('PET_DEFEATED');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('equips the defeated companion once its full-life date has passed, keeping the marker for the sweeper (D-24)', async () => {
        const defeatedUntil = at(100);
        const player = await ownerOf('twitch-pet-recovered', [
            buildOwnedPet(wolfId, {
                currentLifePoints: 1,
                lifeAsOf: at(0),
                defeatedUntil,
                level: 1,
            }),
        ]);
        setClockTo(101);

        const body = await equip(player, wolf);

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipPet).toEqual(EQUIPPED);
        const raw = await rawCharacter(player);
        expect(raw.assets.pet).toEqual(wolfId);
        expect(raw.assets.ownedPets).toEqual([
            buildOwnedPet(wolfId, {
                currentLifePoints: 100,
                defeatedUntil,
                level: 1,
            }),
        ]);
    });

    it("equips a hurt resting companion with the life reached as in the user's example (D-04)", async () => {
        const player = await ownerOf('twitch-pet-hurt', [
            buildOwnedPet(wolfId, {
                currentLifePoints: 20,
                lifeAsOf: at(0),
                level: 1,
            }),
        ]);
        setClockTo(20);

        const body = await equip(player, wolf);

        expect(body.errors).toBeUndefined();
        expect((await rawCharacter(player)).assets.ownedPets).toEqual([
            buildOwnedPet(wolfId, { currentLifePoints: 40, level: 1 }),
        ]);
    });

    it('puts the outgoing companion to rest from the instant of the swap (D-04)', async () => {
        const player = await ownerOf('twitch-pet-swap', [
            buildOwnedPet(wolfId, { currentLifePoints: 30, level: 1 }),
            buildOwnedPet(horseId, { currentLifePoints: 10, level: 1 }),
        ]);
        await characters.updateOne(
            { _id: player.character?._id },
            { 'assets.pet': wolfId },
        );
        setClockTo(15);

        const body = await equip(player, horse);

        expect(body.errors).toBeUndefined();
        const raw = await rawCharacter(player);
        expect(raw.assets.pet).toEqual(horseId);
        expect(raw.assets.ownedPets).toEqual([
            buildOwnedPet(wolfId, {
                currentLifePoints: 30,
                lifeAsOf: at(15),
                level: 1,
            }),
            buildOwnedPet(horseId, { currentLifePoints: 10, level: 1 }),
        ]);
    });

    it('anchors the rest at the instant of the unequip (D-04)', async () => {
        const player = await ownerOf('twitch-pet-rest', [
            buildOwnedPet(wolfId, { currentLifePoints: 45, level: 1 }),
        ]);
        await characters.updateOne(
            { _id: player.character?._id },
            { 'assets.pet': wolfId },
        );
        setClockTo(7);

        const body = await unequip(player);

        expect(body.data?.unequipPet).toEqual(UNEQUIPPED);
        const raw = await rawCharacter(player);
        expect(raw.assets.pet).toBeNull();
        expect(raw.assets.ownedPets).toEqual([
            buildOwnedPet(wolfId, {
                currentLifePoints: 45,
                lifeAsOf: at(7),
                level: 1,
            }),
        ]);
    });

    it('checks the mission lock before the defeat (D-02)', async () => {
        const player = await lockedOwnerOf('twitch-pet-locked', [
            buildOwnedPet(wolfId, {
                currentLifePoints: 1,
                lifeAsOf: at(0),
                defeatedUntil: at(100),
                level: 1,
            }),
        ]);
        const before = await rawCharacter(player);

        const body = await equip(player, wolf);

        expect(codeOf(body)).toBe('MISSION_IN_PROGRESS');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('keeps the name of every companion across equip and unequip (D-23)', async () => {
        const player = await ownerOf('twitch-pet-names', [
            buildOwnedPet(wolfId, {
                currentLifePoints: 100,
                name: 'Zanna',
                level: 1,
            }),
            buildOwnedPet(horseId, { name: 'Brina', level: 1 }),
        ]);

        await equip(player, wolf);
        await equip(player, horse);
        await unequip(player);

        const names = (await rawCharacter(player)).assets.ownedPets.map(
            (entry) => (entry as { name?: unknown }).name,
        );
        expect(names).toEqual(['Zanna', 'Brina']);
    });
});
