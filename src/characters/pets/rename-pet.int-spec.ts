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
import { User, UserDocument } from 'src/models/user.model';
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

const RENAME_PET =
    'mutation($request: RenamePetRequest!) { renamePet(request: $request) { successful response } }';
const OWNED_PET_NAMES =
    'query($id: String!) { character(id: $id) { assets { ownedPets { name } } } }';
const RENAMED = { successful: true, response: 'Nome del compagno aggiornato' };
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const t0 = new Date('2026-11-14T10:00:00.000Z');

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface RawCharacter {
    assets: { pet: unknown; ownedPets: Record<string, unknown>[] };
}

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

describe('renamePet (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let pets: Model<PetDocument>;
    let worgId: Types.ObjectId;
    let horseId: Types.ObjectId;

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

    async function rawCharacter(player: TestPlayer): Promise<RawCharacter> {
        return (await characters.collection.findOne({
            _id: new Types.ObjectId(idOf(player)),
        })) as unknown as RawCharacter;
    }

    async function rename(
        characterId: string,
        petId: Types.ObjectId,
        name: string | null,
        bearer: string,
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            RENAME_PET,
            {
                request: { id: characterId, petId: petId.toHexString(), name },
            },
            bearer,
        );
        return response.body as WireBody;
    }

    async function servedNames(player: TestPlayer): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            OWNED_PET_NAMES,
            { id: idOf(player) },
            player.bearer,
        );
        return response.body as WireBody;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp({ clock: new FixedClock(t0) });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        pets = harness.connection.model<PetDocument>(Pet.name);
    });

    beforeEach(async () => {
        const worg = await persistPet(pets, {
            name: 'Worg',
            maxLifePoints: 100,
            maxXp: 100,
            recoveryTime: 100 * MINUTE_MS,
        });
        const horse = await persistPet(pets, { name: 'Cavallo da viaggio' });
        worgId = worg._id as Types.ObjectId;
        horseId = horse._id as Types.ObjectId;
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('names an owned companion and serves the name on the character (D-18, D-19)', async () => {
        const victim = await ownerOf('twitch-rename-named', [
            buildOwnedPet(worgId, { currentLifePoints: 100, level: 1 }),
        ]);

        const body = await rename(
            idOf(victim),
            worgId,
            '  Fenrir ',
            victim.bearer,
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.renamePet).toEqual(RENAMED);
        expect((await rawCharacter(victim)).assets.ownedPets[0].name).toBe(
            'Fenrir',
        );
        expect((await servedNames(victim)).data?.character).toEqual({
            assets: { ownedPets: [{ name: 'Fenrir' }] },
        });
    });

    it('renames and clears the name of a companion (D-19, D-31)', async () => {
        const victim = await ownerOf('twitch-rename-clear', [
            buildOwnedPet(worgId, {
                currentLifePoints: 100,
                level: 1,
                name: 'Fenrir',
            }),
        ]);

        const renamed = await rename(
            idOf(victim),
            worgId,
            'Zanna',
            victim.bearer,
        );
        const renamedEntry = (await rawCharacter(victim)).assets.ownedPets[0];
        const cleared = await rename(idOf(victim), worgId, null, victim.bearer);

        expect(renamed.data?.renamePet).toEqual(RENAMED);
        expect(renamedEntry.name).toBe('Zanna');
        expect(cleared.data?.renamePet).toEqual(RENAMED);
        expect((await rawCharacter(victim)).assets.ownedPets).toEqual([
            buildOwnedPet(worgId, { currentLifePoints: 100, level: 1 }),
        ]);
        expect((await servedNames(victim)).data?.character).toEqual({
            assets: { ownedPets: [{ name: null }] },
        });
    });

    it('refuses an invalid name with PET_NAME_INVALID and writes nothing (D-31)', async () => {
        const victim = await ownerOf('twitch-rename-invalid', [
            buildOwnedPet(worgId),
        ]);
        const before = await rawCharacter(victim);

        const body = await rename(
            idOf(victim),
            worgId,
            'Fenrir1',
            victim.bearer,
        );

        expect(codeOf(body)).toBe('PET_NAME_INVALID');
        expect(await rawCharacter(victim)).toEqual(before);
    });

    it('refuses a species the character does not own with PET_NOT_OWNED (D-23)', async () => {
        const victim = await ownerOf('twitch-rename-unowned', [
            buildOwnedPet(worgId),
        ]);
        const before = await rawCharacter(victim);

        const body = await rename(
            idOf(victim),
            horseId,
            'Fenrir',
            victim.bearer,
        );

        expect(codeOf(body)).toBe('PET_NOT_OWNED');
        expect(await rawCharacter(victim)).toEqual(before);
    });

    it("refuses another player's character and leaves both companions untouched (D-23)", async () => {
        const victim = await ownerOf('twitch-rename-victim', [
            buildOwnedPet(worgId, { name: 'Fenrir', level: 1 }),
        ]);
        const attacker = await ownerOf('twitch-rename-attacker', [
            buildOwnedPet(worgId, { name: 'Ombra', level: 1 }),
        ]);
        const victimBefore = await rawCharacter(victim);
        const attackerBefore = await rawCharacter(attacker);

        const body = await rename(
            idOf(victim),
            worgId,
            'Preda',
            attacker.bearer,
        );

        expect(codeOf(body)).toBe('FORBIDDEN');
        expect(await rawCharacter(victim)).toEqual(victimBefore);
        expect(await rawCharacter(attacker)).toEqual(attackerBefore);

        const own = await rename(
            idOf(attacker),
            worgId,
            'Notte',
            attacker.bearer,
        );

        expect(own.data?.renamePet).toEqual(RENAMED);
        expect((await rawCharacter(attacker)).assets.ownedPets[0].name).toBe(
            'Notte',
        );
        expect(await rawCharacter(victim)).toEqual(victimBefore);
    });

    it('refuses the innkeeper on a character it does not own (D-23)', async () => {
        const victim = await ownerOf('twitch-rename-oste-victim', [
            buildOwnedPet(worgId, { name: 'Fenrir', level: 1 }),
        ]);
        const oste = await createPlayer(harness, {
            twitchId: 'twitch-rename-oste',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        const before = await rawCharacter(victim);

        const body = await rename(idOf(victim), worgId, 'Oste', oste.bearer);

        expect(codeOf(body)).toBe('FORBIDDEN');
        expect(await rawCharacter(victim)).toEqual(before);
    });

    it('renames during a mission in progress (D-31)', async () => {
        const locked = await lockedOwnerOf('twitch-rename-locked', [
            buildOwnedPet(worgId, { currentLifePoints: 100, level: 1 }),
        ]);

        const body = await rename(
            idOf(locked),
            worgId,
            'Fenrir',
            locked.bearer,
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.renamePet).toEqual(RENAMED);
        expect((await rawCharacter(locked)).assets.ownedPets[0].name).toBe(
            'Fenrir',
        );
    });

    it('answers NOT_FOUND for an archived character (D-23)', async () => {
        const victim = await ownerOf('twitch-rename-archived', [
            buildOwnedPet(worgId),
        ]);
        await characters.updateOne(
            { _id: victim.character!._id },
            { $set: { deletedAt: t0, deletionReason: 'user_request' } },
        );
        await users.updateOne(
            { _id: victim.user._id },
            { $set: { currentCharacter: null } },
        );
        const before = await rawCharacter(victim);

        const body = await rename(
            idOf(victim),
            worgId,
            'Fenrir',
            victim.bearer,
        );

        expect(codeOf(body)).toBe('NOT_FOUND');
        expect(await rawCharacter(victim)).toEqual(before);
    });

    it('writes the level and the full life of a companion never touched by the phase when it is renamed (D-23, D-38)', async () => {
        const hurt = buildOwnedPet(horseId, {
            currentLifePoints: 4,
            level: 1,
            lifeAsOf: t0,
        });
        const victim = await ownerOf('twitch-rename-legacy', [
            buildOwnedPet(worgId, { xp: 22, currentLifePoints: 100 }),
            hurt,
        ]);

        await rename(idOf(victim), worgId, 'Fenrir', victim.bearer);
        await rename(idOf(victim), horseId, 'Brezza', victim.bearer);

        expect((await rawCharacter(victim)).assets.ownedPets).toEqual([
            {
                pet: worgId,
                xp: 22,
                currentLifePoints: 122,
                level: 5,
                name: 'Fenrir',
            },
            { ...hurt, name: 'Brezza' },
        ]);
    });
});
