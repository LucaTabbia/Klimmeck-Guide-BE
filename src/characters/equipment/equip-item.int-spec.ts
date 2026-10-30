import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import { CharactersService } from 'src/characters/characters.service';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter, persistEquipmentItem } from '../../../test/fixtures';

const EQUIP_ITEM =
    'mutation($request: EquipItemRequest!) { equipItem(request: $request) { successful response } }';
const EQUIPPED = {
    successful: true,
    response: 'Equipaggiamento cambiato con successo',
};

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface RawCharacter {
    assets: { wearedEquipment: Record<string, unknown> };
}

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

describe('equipItem (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    const sword = new Types.ObjectId();

    function playerWith(
        twitchId: string,
        assets: Record<string, unknown>,
    ): Promise<TestPlayer> {
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                assets: { ...buildCharacter().assets, ...assets },
            },
        });
    }

    function ownerOfSword(
        twitchId: string,
        wearedEquipment: Record<string, unknown> = {},
    ): Promise<TestPlayer> {
        return playerWith(twitchId, {
            ownedEquipments: [
                { itemType: 'EquipmentItem', item: sword, quantity: 1 },
            ],
            wearedEquipment,
        });
    }

    function idOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    async function rawCharacter(player: TestPlayer): Promise<RawCharacter> {
        return (await characters.collection.findOne({
            _id: new Types.ObjectId(idOf(player)),
        })) as unknown as RawCharacter;
    }

    async function equip(
        player: TestPlayer,
        fields: Record<string, unknown>,
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            EQUIP_ITEM,
            { request: { id: idOf(player), slotType: 'head', ...fields } },
            player.bearer,
        );
        return response.body as WireBody;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('equips an owned item and stores an ObjectId', async () => {
        const player = await ownerOfSword('twitch-item-owned');

        const body = await equip(player, { itemId: sword.toHexString() });

        expect(body.errors).toBeUndefined();
        expect(body.data?.equipItem).toEqual(EQUIPPED);
        expect(
            (await rawCharacter(player)).assets.wearedEquipment.head,
        ).toEqual(sword);
        expect(
            await characters.collection.countDocuments({
                _id: new Types.ObjectId(idOf(player)),
                'assets.wearedEquipment.head': { $type: 'objectId' },
            }),
        ).toBe(1);
    });

    it('rejects an item the character does not own with ITEM_NOT_OWNED', async () => {
        const player = await ownerOfSword('twitch-item-unowned');
        const before = await rawCharacter(player);

        const body = await equip(player, {
            itemId: new Types.ObjectId().toHexString(),
        });

        expect(codeOf(body)).toBe('ITEM_NOT_OWNED');
        expect(body.errors?.[0]?.message).toBe('Oggetto non posseduto');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('rejects a malformed item id with BAD_USER_INPUT (D-02)', async () => {
        const player = await ownerOfSword('twitch-item-malformed');
        const before = await rawCharacter(player);

        const body = await equip(player, { itemId: 'abc' });

        expect(body.errors?.[0]?.extensions).toEqual({
            code: 'BAD_USER_INPUT',
        });
        expect(body.errors?.[0]?.message).toBe('Input non valido: itemId');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('clears the slot when itemId is omitted or null', async () => {
        const player = await ownerOfSword('twitch-item-clear', {
            head: sword,
        });

        expect((await equip(player, {})).data?.equipItem).toEqual(EQUIPPED);
        expect(
            (await rawCharacter(player)).assets.wearedEquipment.head,
        ).toBeNull();

        await characters.collection.updateOne(
            { _id: new Types.ObjectId(idOf(player)) },
            { $set: { 'assets.wearedEquipment.head': sword } },
        );

        expect((await equip(player, { itemId: null })).data?.equipItem).toEqual(
            EQUIPPED,
        );
        expect(
            (await rawCharacter(player)).assets.wearedEquipment.head,
        ).toBeNull();
    });

    it('equips one item per slot under concurrent equips', async () => {
        const helmet = new Types.ObjectId();
        const crown = new Types.ObjectId();
        const player = await playerWith('twitch-item-race', {
            ownedEquipments: [
                { itemType: 'EquipmentItem', item: helmet, quantity: 1 },
                { itemType: 'EquipmentItem', item: crown, quantity: 1 },
            ],
        });

        const bodies = await Promise.all(
            [helmet, crown, helmet, crown].map((item) =>
                equip(player, { itemId: item.toHexString() }),
            ),
        );

        expect(bodies.map((body) => body.data?.equipItem)).toEqual(
            Array.from({ length: 4 }, () => EQUIPPED),
        );
        const worn = (await rawCharacter(player)).assets.wearedEquipment;
        expect([helmet, crown]).toContainEqual(worn.head);
        expect(
            Object.values(worn).filter(
                (slot) => slot instanceof Types.ObjectId,
            ),
        ).toHaveLength(1);
    });

    it('rejects a malformed item id that reaches the service past the pipe with ITEM_NOT_OWNED', async () => {
        const player = await ownerOfSword('twitch-item-service-malformed');
        const before = await rawCharacter(player);
        const service = harness.app.get(CharactersService);

        await expect(
            service.equipItem({
                id: idOf(player),
                slotType: 'head',
                itemId: 'abc',
            } as Parameters<CharactersService['equipItem']>[0]),
        ).rejects.toMatchObject({ code: 'ITEM_NOT_OWNED' });

        expect(await rawCharacter(player)).toEqual(before);
    });

    it('reads the equipped item back populated from the owned equipments', async () => {
        const equipment = harness.connection.model<EquipmentItemDocument>(
            EquipmentItem.name,
        );
        const helmet = await persistEquipmentItem(equipment, {
            name: 'Elmo',
        });
        const helmetId = helmet._id as Types.ObjectId;
        const player = await playerWith('twitch-item-populated', {
            ownedEquipments: [
                { itemType: 'EquipmentItem', item: helmetId, quantity: 1 },
            ],
        });

        expect(
            (await equip(player, { itemId: helmetId.toHexString() })).data
                ?.equipItem,
        ).toEqual(EQUIPPED);
        const character = await harness.app
            .get(CharactersService)
            .findOne(idOf(player));

        expect(character.assets.wearedEquipment.head).toMatchObject({
            name: 'Elmo',
        });
    });

    it('does not equip an item owned only as loot', async () => {
        const player = await playerWith('twitch-item-loot', {
            ownedItems: [{ itemType: 'LootItem', item: sword, quantity: 1 }],
            ownedEquipments: [],
        });
        const before = await rawCharacter(player);

        const body = await equip(player, { itemId: sword.toHexString() });

        expect(codeOf(body)).toBe('ITEM_NOT_OWNED');
        expect(await rawCharacter(player)).toEqual(before);
    });
});
