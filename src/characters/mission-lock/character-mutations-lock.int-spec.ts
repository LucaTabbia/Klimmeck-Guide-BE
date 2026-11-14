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
import { Spell, SpellDocument } from 'src/models/spell.model';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    persistPet,
    persistSpell,
    spellStatesOf,
} from '../../../test/fixtures';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const STARTED = new Date('2026-11-14T11:00:00.000Z');
const HOUR_MS = 3_600_000;

const EQUIP_ITEM =
    'mutation($request: EquipItemRequest!) { equipItem(request: $request) { successful } }';
const EQUIP_PET =
    'mutation($request: EquipPetRequest!) { equipPet(request: $request) { successful } }';
const UNEQUIP_PET =
    'mutation($request: UnequipPetRequest!) { unequipPet(request: $request) { successful } }';
const EQUIP_SPELL =
    'mutation($request: EquipSpellRequest!) { equipSpell(request: $request) { successful } }';
const UNEQUIP_SPELL =
    'mutation($request: EquipSpellRequest!) { unequipSpell(request: $request) { successful } }';
const USE_SPELL =
    'mutation($request: UseSpellRequest!) { useSpell(request: $request) { successful } }';

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface LaneDates {
    startDate?: Date | null;
    missionDraftStartedAt?: Date | null;
}

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

describe('Character mutations under the mission lock (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let pets: Model<PetDocument>;
    let spells: Model<SpellDocument>;
    const sword = new Types.ObjectId();

    beforeAll(async () => {
        harness = await createCharactersTestApp({ clock: new FixedClock(NOW) });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        pets = harness.connection.model<PetDocument>(Pet.name);
        spells = harness.connection.model<SpellDocument>(Spell.name);
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function pendingQuestOf(dates: LaneDates): Promise<Types.ObjectId> {
        const pendingQuest = await pendingQuests.create({
            startDate: null,
            waitingTime: HOUR_MS,
            pointsSpent: 0,
            quest: new Types.ObjectId(),
            ...dates,
        });
        return pendingQuest._id as Types.ObjectId;
    }

    async function heroOn(
        twitchId: string,
        lane: QuestLane,
        dates: LaneDates,
        extra: Record<string, unknown> = {},
    ): Promise<TestPlayer> {
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                quests: {
                    ...buildCharacter().quests,
                    [lane]: await pendingQuestOf(dates),
                },
                ...extra,
            },
        });
    }

    async function armedHero(
        twitchId: string,
        lane: QuestLane,
        dates: LaneDates,
    ): Promise<{ player: TestPlayer; petId: string }> {
        const pet = await persistPet(pets, {
            name: `Cavallo ${twitchId}`,
            speedModifier: 2,
        });
        const player = await heroOn(twitchId, lane, dates, {
            assets: {
                ...buildCharacter().assets,
                ownedEquipments: [
                    { itemType: 'EquipmentItem', item: sword, quantity: 1 },
                ],
                ownedPets: [buildOwnedPet(pet._id as Types.ObjectId)],
            },
        });
        return { player, petId: String(pet._id) };
    }

    function idOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    function rawCharacter(player: TestPlayer): Promise<unknown> {
        return characters.collection.findOne({
            _id: new Types.ObjectId(idOf(player)),
        });
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

    function equipSword(player: TestPlayer, bearer = player.bearer) {
        return send(
            EQUIP_ITEM,
            {
                request: {
                    id: idOf(player),
                    slotType: 'head',
                    itemId: sword.toHexString(),
                },
            },
            bearer,
        );
    }

    function equipPet(player: TestPlayer, petId: string) {
        return send(
            EQUIP_PET,
            { request: { id: idOf(player), petId } },
            player.bearer,
        );
    }

    function unequipPet(player: TestPlayer) {
        return send(
            UNEQUIP_PET,
            { request: { id: idOf(player) } },
            player.bearer,
        );
    }

    it('refuses to change the equipment while the hunt waits on the marker (D-12)', async () => {
        const { player } = await armedHero(
            'twitch-lock-hunt',
            QuestLane.standard,
            { startDate: STARTED },
        );
        const before = await rawCharacter(player);

        const body = await equipSword(player);

        expect(codeOf(body)).toBe('MISSION_IN_PROGRESS');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('refuses to equip or rest the companion during a guided draft (D-11)', async () => {
        const { player, petId } = await armedHero(
            'twitch-lock-draft',
            QuestLane.story,
            { missionDraftStartedAt: STARTED },
        );
        await characters.updateOne(
            { _id: player.character?._id },
            { 'assets.pet': new Types.ObjectId(petId) },
        );
        const before = await rawCharacter(player);

        const equipped = await equipPet(player, petId);
        const rested = await unequipPet(player);

        expect(codeOf(equipped)).toBe('MISSION_IN_PROGRESS');
        expect(codeOf(rested)).toBe('MISSION_IN_PROGRESS');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('allows the same changes while travelling to the quest (D-12)', async () => {
        const { player, petId } = await armedHero(
            'twitch-lock-travel',
            QuestLane.standard,
            { startDate: null },
        );

        const equippedItem = await equipSword(player);
        const equippedPet = await equipPet(player, petId);

        expect(equippedItem.errors).toBeUndefined();
        expect(equippedItem.data?.equipItem).toEqual({ successful: true });
        expect(equippedPet.errors).toBeUndefined();
        expect(equippedPet.data?.equipPet).toEqual({ successful: true });
    });

    it('allows a wounded character awaiting aid to change the equipment (D-23)', async () => {
        const player = await createPlayer(harness, {
            twitchId: 'twitch-lock-wounded',
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    awaitingAid: {
                        quest: new Types.ObjectId(),
                        aidQuest: new Types.ObjectId(),
                        since: STARTED,
                    },
                },
                assets: {
                    ...buildCharacter().assets,
                    ownedEquipments: [
                        { itemType: 'EquipmentItem', item: sword, quantity: 1 },
                    ],
                },
            },
        });

        const body = await equipSword(player);

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipItem).toEqual({ successful: true });
    });

    it('refuses the innkeeper bypass too (D-12)', async () => {
        const { player } = await armedHero(
            'twitch-lock-bypass',
            QuestLane.standard,
            { startDate: STARTED },
        );
        const oste = await createPlayer(harness, {
            twitchId: 'twitch-lock-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        const before = await rawCharacter(player);

        const body = await equipSword(player, oste.bearer);

        expect(codeOf(body)).toBe('MISSION_IN_PROGRESS');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('refuses with no extra keys in the extensions (D-23)', async () => {
        const { player } = await armedHero(
            'twitch-lock-keys',
            QuestLane.worldMission,
            { missionDraftStartedAt: STARTED },
        );

        const body = await equipSword(player);

        expect(Object.keys(body.errors?.[0]?.extensions ?? {}).sort()).toEqual([
            'code',
        ]);
        expect(codeOf(body)).toBe('MISSION_IN_PROGRESS');
    });

    interface SpellBook {
        player: TestPlayer;
        resting: string;
        active: string;
    }

    async function mageOn(
        twitchId: string,
        lane: QuestLane,
        dates: LaneDates,
    ): Promise<SpellBook> {
        const resting = await persistSpell(spells, {
            name: `Dardo ${twitchId}`,
        });
        const active = await persistSpell(spells, {
            name: `Scudo ${twitchId}`,
        });
        const player = await heroOn(twitchId, lane, dates, {
            status: {
                ...buildCharacter().status,
                title: 'mage',
                xp: 25000,
                spellStates: spellStatesOf([
                    { spell: resting._id, usages: 3 },
                    { spell: active._id, usages: 1, active: true },
                ]),
            },
        });
        return {
            player,
            resting: String(resting._id),
            active: String(active._id),
        };
    }

    function equipSpell({ player, resting }: SpellBook) {
        return send(
            EQUIP_SPELL,
            { request: { id: idOf(player), spellId: resting } },
            player.bearer,
        );
    }

    function unequipSpell({ player, active }: SpellBook) {
        return send(
            UNEQUIP_SPELL,
            { request: { id: idOf(player), spellId: active } },
            player.bearer,
        );
    }

    function useSpell({ player, active }: SpellBook) {
        return send(
            USE_SPELL,
            { request: { characterId: idOf(player), spellId: active } },
            player.bearer,
        );
    }

    it('refuses to swap or use spells while the boss party has started (D-12)', async () => {
        const book = await mageOn('twitch-lock-boss', QuestLane.standard, {
            startDate: STARTED,
        });
        const before = await rawCharacter(book.player);

        const bodies = [
            await equipSpell(book),
            await unequipSpell(book),
            await useSpell(book),
        ];

        expect(bodies.map(codeOf)).toEqual([
            'MISSION_IN_PROGRESS',
            'MISSION_IN_PROGRESS',
            'MISSION_IN_PROGRESS',
        ]);
        expect(await rawCharacter(book.player)).toEqual(before);
    });

    it('allows spells again once the mission is over (D-11)', async () => {
        const book = await mageOn('twitch-lock-over', QuestLane.standard, {
            startDate: STARTED,
        });
        expect(codeOf(await equipSpell(book))).toBe('MISSION_IN_PROGRESS');
        await characters.updateOne(
            { _id: book.player.character?._id },
            { 'quests.pendingQuest': null },
        );

        const body = await equipSpell(book);

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipSpell).toEqual({ successful: true });
    });
});
