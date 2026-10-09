import { Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CharacterCreationModule } from 'src/characters/creation/character-creation.module';
import { listRaceTraits } from 'src/characters/creation/race-traits';
import { RandomSource } from 'src/characters/creation/random-source';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import { createAuthenticatedUser } from '../../../test/auth/test-tokens';
import { FixedRandomSource } from '../../../test/characters/fixed-random-source';
import { persistCity } from '../../../test/fixtures';

const TWITCH_ID = 'twitch-char-1';
const OTHER_TWITCH_ID = 'twitch-char-2';
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;
const TOO_LONG_BACKGROUND = 'a'.repeat(501);

const VALID_INPUT = {
    name: 'Aria',
    sex: 'female',
    pronoun: 'she',
    race: 'human',
    classType: 'wizard',
    age: 25,
    background: '  Nata a Drustea.  ',
    imagePath: 'https://cdn.test/image.png',
};

const CREATE_CHARACTER = `
    mutation Create($input: CreateCharacterInput!) {
        createCharacter(input: $input) {
            id
            twitchId
            currentCharacter { id infos { name race age background imagePath } }
        }
    }
`;

const RACE_TRAITS_QUERY = '{ raceTraits { race minAge maxAge } }';

const EMPTY_WEARED_EQUIPMENT = {
    head: null,
    chest: null,
    arms: null,
    legs: null,
    foots: null,
    leftHand: null,
    rightHand: null,
    firstAccessory: null,
    secondAccessory: null,
};

type CharacterInput = Record<string, unknown>;

interface WireCharacter {
    id: string;
    infos: {
        name: string;
        race: string;
        age: number;
        background: string | null;
        imagePath: string | null;
    };
}

interface WireUser {
    id: string;
    twitchId: string;
    currentCharacter: WireCharacter | null;
}

interface WireError {
    message: string;
    extensions: Record<string, unknown>;
}

interface WireBody {
    data?: {
        createCharacter?: WireUser | null;
        raceTraits?: unknown[];
    } | null;
    errors?: WireError[];
}

describe('CharacterCreationResolver (wire)', () => {
    let harness: AuthTestApp;
    let random: FixedRandomSource;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let cities: Model<CityDocument>;
    let pois: Model<PointOfInterest>;
    let user: UserDocument;
    let bearer: string;
    let drustea: CityDocument;
    let liberia: CityDocument;
    let minnely: CityDocument;
    let motherKingdom: CityDocument;

    beforeAll(async () => {
        random = new FixedRandomSource(0);
        harness = await createAuthTestApp({
            imports: [CharacterCreationModule],
            overrides: [{ token: RandomSource, useValue: random }],
        });
        users = harness.connection.model<UserDocument>(User.name);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        cities = harness.connection.model<CityDocument>(City.name);
        pois = harness.connection.model<PointOfInterest>(PointOfInterest.name);
        // indici e collection prima delle transazioni e dei test di unicità
        await Promise.all(
            [User.name, Character.name, City.name, PointOfInterest.name].map(
                (name) => harness.connection.model(name).init(),
            ),
        );
    });

    beforeEach(async () => {
        random.setIndex(0);
        random.requestedLengths.length = 0;
        drustea = await seedCity('drusteaCapital', 'Drustea');
        liberia = await seedCity('liberiaCapital', 'Liberia');
        minnely = await seedCity('elfCapital', 'Minnely');
        motherKingdom = await seedCity('motherCapital', 'Regno della Madre');
        await seedCity('mountainVillage', 'Lamstone');
        ({ user, bearer } = await createAuthenticatedUser(harness, {
            twitchId: TWITCH_ID,
        }));
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function seedCity(type: string, name: string): Promise<CityDocument> {
        return (await persistCity(
            cities,
            { type, name },
            pois,
        )) as CityDocument;
    }

    async function create(
        input: CharacterInput,
        bearerToUse: string | null = bearer,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            CREATE_CHARACTER,
            { input },
            bearerToUse ?? undefined,
        );
        expect(response.status).toBe(200);
        return response.body as WireBody;
    }

    async function signInOtherUser(): Promise<{
        otherUser: UserDocument;
        otherBearer: string;
    }> {
        const { user: otherUser, bearer: otherBearer } =
            await createAuthenticatedUser(harness, {
                twitchId: OTHER_TWITCH_ID,
            });
        return { otherUser, otherBearer };
    }

    function createdCharacterOf(body: WireBody): WireCharacter {
        expect(body.errors).toBeUndefined();
        return body.data?.createCharacter?.currentCharacter as WireCharacter;
    }

    function expectDomainError(body: WireBody, code: string): WireError {
        const [error] = body.errors ?? [];
        expect(error.extensions).toEqual({ code });
        return error;
    }

    function rawCharacter(id: string) {
        return characters.collection.findOne({ _id: new Types.ObjectId(id) });
    }

    function rawUser(id: unknown) {
        return users.collection.findOne({ _id: id as Types.ObjectId });
    }

    async function expectLocation(
        character: WireCharacter,
        city: CityDocument,
    ): Promise<void> {
        const raw = await rawCharacter(character.id);
        const location = raw?.status.location as unknown;
        expect(location).toBeInstanceOf(Types.ObjectId);
        expect(
            (location as Types.ObjectId).equals(
                city.markerLocation as unknown as Types.ObjectId,
            ),
        ).toBe(true);
    }

    async function expectNothingPersisted(userId: unknown): Promise<void> {
        expect(await characters.countDocuments()).toBe(0);
        const raw = await rawUser(userId);
        expect(raw?.currentCharacter).toBeNull();
    }

    describe('createCharacter', () => {
        it('creates the character with the backend-owned starting state', async () => {
            const body = await create(VALID_INPUT);

            expect(body.errors).toBeUndefined();
            const created = body.data?.createCharacter as WireUser;
            expect(created.id).toBe(String(user._id));
            expect(created.twitchId).toBe(TWITCH_ID);
            const character = created.currentCharacter as WireCharacter;
            expect(character.id).toMatch(OBJECT_ID_PATTERN);
            expect(character.infos).toEqual({
                name: 'Aria',
                race: 'human',
                age: 25,
                background: 'Nata a Drustea.',
                imagePath: 'https://cdn.test/image.png',
            });

            const raw = await rawCharacter(character.id);
            expect(raw?.status).toMatchObject({
                xp: 0,
                level: 1,
                title: 'rookie',
                currentLifePoints: 100,
                maxLifePoints: 100,
                coins: { gold: 0, silver: 5, copper: 0 },
                injuries: [],
                spells: [],
            });
            await expectLocation(character, drustea);
            expect(raw?.quests).toEqual({
                completedQuests: [],
                pendingQuest: null,
            });
            expect(raw?.assets.ownedEquipments).toEqual([]);
            expect(raw?.assets.ownedItems).toEqual([]);
            expect(raw?.assets.activeSpells).toEqual([]);
            expect(raw?.assets.pet).toBeNull();
            expect(raw?.assets.wearedEquipment).toEqual(EMPTY_WEARED_EQUIPMENT);

            const rawOwner = await rawUser(user._id);
            const currentCharacter = rawOwner?.currentCharacter as unknown;
            expect(currentCharacter).toBeInstanceOf(Types.ObjectId);
            expect(
                (currentCharacter as Types.ObjectId).equals(
                    new Types.ObjectId(character.id),
                ),
            ).toBe(true);
        });

        it('picks the human starting capital through the random source', async () => {
            random.setIndex(1);

            const character = createdCharacterOf(await create(VALID_INPUT));

            await expectLocation(character, liberia);
            expect(random.requestedLengths).toEqual([2]);
        });

        it('starts an elf in the elf capital', async () => {
            const character = createdCharacterOf(
                await create({ ...VALID_INPUT, race: 'elf', age: 120 }),
            );

            await expectLocation(character, minnely);
        });

        it('starts a dwarf in the capital of the Mother kingdom', async () => {
            const { otherBearer } = await signInOtherUser();

            const character = createdCharacterOf(
                await create(
                    { ...VALID_INPUT, name: 'Brok', race: 'dwarf', age: 50 },
                    otherBearer,
                ),
            );

            await expectLocation(character, motherKingdom);
        });

        it('defaults a missing image to null and a missing background to empty', async () => {
            const input: CharacterInput = { ...VALID_INPUT };
            delete input.imagePath;
            delete input.background;

            const character = createdCharacterOf(await create(input));

            expect(character.infos.imagePath).toBeNull();
            expect(character.infos.background).toBe('');
        });

        it('rejects a second character with CHARACTER_ALREADY_EXISTS', async () => {
            await create(VALID_INPUT);

            const body = await create({ ...VALID_INPUT, name: 'Brina' });

            const error = expectDomainError(body, 'CHARACTER_ALREADY_EXISTS');
            expect(error.message).toBe('Hai già un personaggio');
            expect(await characters.countDocuments()).toBe(1);
        });

        it('creates exactly one character for concurrent calls of the same user', async () => {
            const [a, b] = await Promise.all([
                create({ ...VALID_INPUT, name: 'Aria' }),
                create({ ...VALID_INPUT, name: 'Brina' }),
            ]);

            const winners = [a, b].filter(
                (body) => body.data?.createCharacter != null,
            );
            const losers = [a, b].filter((body) => body.errors !== undefined);
            expect(winners).toHaveLength(1);
            expect(losers).toHaveLength(1);
            expect(losers[0].errors?.[0].extensions).toEqual({
                code: 'CHARACTER_ALREADY_EXISTS',
            });
            expect(await characters.countDocuments()).toBe(1);
            const winnerId = createdCharacterOf(winners[0]).id;
            const rawOwner = await rawUser(user._id);
            expect(String(rawOwner?.currentCharacter)).toBe(winnerId);
        });

        it('rejects a name taken ignoring case with CHARACTER_NAME_TAKEN and rolls back the claim', async () => {
            await create(VALID_INPUT);
            const { otherUser, otherBearer } = await signInOtherUser();

            const body = await create(
                { ...VALID_INPUT, name: 'ARIA' },
                otherBearer,
            );

            const error = expectDomainError(body, 'CHARACTER_NAME_TAKEN');
            expect(error.message).toBe('Nome già in uso');
            expect(await characters.countDocuments()).toBe(1);
            const rawOther = await rawUser(otherUser._id);
            expect(rawOther?.currentCharacter).toBeNull();
            const serialized = JSON.stringify(body);
            expect(serialized).not.toContain('E11000');
            expect(serialized).not.toContain('keyValue');
        });

        it.each(['D’Arcy', 'DʼArcy'])(
            'treats the apostrophe lookalike in %p as the same name',
            async (lookalike) => {
                const first = createdCharacterOf(
                    await create({ ...VALID_INPUT, name: "D'Arcy" }),
                );
                const { otherBearer } = await signInOtherUser();

                const body = await create(
                    { ...VALID_INPUT, name: lookalike },
                    otherBearer,
                );

                expectDomainError(body, 'CHARACTER_NAME_TAKEN');
                expect(first.infos.name).toBe("D'Arcy");
                const raw = await rawCharacter(first.id);
                expect(raw?.infos.name).toBe("D'Arcy");
            },
        );

        it('rejects an invalid name with CHARACTER_NAME_INVALID', async () => {
            const body = await create({ ...VALID_INPUT, name: '--' });

            expectDomainError(body, 'CHARACTER_NAME_INVALID');
            await expectNothingPersisted(user._id);
        });

        it('rejects an age out of the race range without logging an error', async () => {
            const errorSpy = jest
                .spyOn(Logger.prototype, 'error')
                .mockImplementation(() => undefined);
            try {
                const body = await create({
                    ...VALID_INPUT,
                    race: 'elf',
                    age: 99,
                });

                expectDomainError(body, 'CHARACTER_AGE_OUT_OF_RANGE');
                expect(errorSpy).not.toHaveBeenCalled();
            } finally {
                errorSpy.mockRestore();
            }
            await expectNothingPersisted(user._id);
        });

        it('rejects a background longer than 500 characters with BAD_USER_INPUT', async () => {
            const body = await create({
                ...VALID_INPUT,
                background: TOO_LONG_BACKGROUND,
            });

            expectDomainError(body, 'BAD_USER_INPUT');
            await expectNothingPersisted(user._id);
        });

        it('rejects a non-https image with BAD_USER_INPUT', async () => {
            const body = await create({
                ...VALID_INPUT,
                imagePath: 'http://cdn.test/image.png',
            });

            expectDomainError(body, 'BAD_USER_INPUT');
            await expectNothingPersisted(user._id);
        });

        it('rejects an unknown enum value with BAD_USER_INPUT before the resolver', async () => {
            const response = await graphqlRequest(
                harness.app,
                CREATE_CHARACTER,
                { input: { ...VALID_INPUT, race: 'orc' } },
                bearer,
            );

            const body = response.body as WireBody;
            expect(body.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
            await expectNothingPersisted(user._id);
        });

        it('rejects a race without a home city with STARTING_LOCATION_UNAVAILABLE', async () => {
            const body = await create({
                ...VALID_INPUT,
                race: 'aarakocra',
                age: 20,
            });

            expectDomainError(body, 'STARTING_LOCATION_UNAVAILABLE');
            await expectNothingPersisted(user._id);
        });

        it('rejects an anonymous caller with UNAUTHENTICATED', async () => {
            const body = await create(VALID_INPUT, null);

            expect(body.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
            await expectNothingPersisted(user._id);
        });

        it('rejects a valid bearer whose user no longer exists with UNAUTHENTICATED', async () => {
            await users.deleteOne({ _id: user._id });

            const body = await create(VALID_INPUT);

            expectDomainError(body, 'UNAUTHENTICATED');
            expect(await characters.countDocuments()).toBe(0);
        });
    });

    describe('raceTraits', () => {
        it('returns the same table used by the validation', async () => {
            const response = await graphqlRequest(
                harness.app,
                RACE_TRAITS_QUERY,
                undefined,
                bearer,
            );

            expect(response.status).toBe(200);
            const body = response.body as WireBody;
            expect(body.errors).toBeUndefined();
            expect(body.data?.raceTraits).toEqual(listRaceTraits());
            expect(body.data?.raceTraits).toHaveLength(9);
            expect(body.data?.raceTraits).toContainEqual({
                race: 'elf',
                minAge: 100,
                maxAge: 9999,
            });
            expect(body.data?.raceTraits).toContainEqual({
                race: 'aarakocra',
                minAge: 3,
                maxAge: 40,
            });
        });

        it('rejects an anonymous caller with UNAUTHENTICATED', async () => {
            const response = await graphqlRequest(
                harness.app,
                RACE_TRAITS_QUERY,
            );

            const body = response.body as WireBody;
            expect(body.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
        });
    });
});
