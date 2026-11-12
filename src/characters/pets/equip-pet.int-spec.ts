import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Pet, PetDocument } from 'src/models/pet.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
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
    let characters: Model<CharacterDocument>;
    let pets: Model<PetDocument>;
    let horse: PetDocument;
    let cat: PetDocument;
    let horseId: Types.ObjectId;
    let catId: Types.ObjectId;

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

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        pets = harness.connection.model<PetDocument>(Pet.name);
    });

    beforeEach(async () => {
        horse = await persistPet(pets, {
            name: 'Cavallo da viaggio',
            speedModifier: 2,
        });
        cat = await persistPet(pets, { name: 'Gatto', speedModifier: null });
        horseId = horse._id as Types.ObjectId;
        catId = cat._id as Types.ObjectId;
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

    it('equips a pet owned as an entry and leaves its state untouched (D-03)', async () => {
        const entry = buildOwnedPet(horseId, { xp: 12, currentLifePoints: 7 });
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
        expect(raw.assets.ownedPets).toEqual([buildOwnedPet(horseId)]);
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
});
