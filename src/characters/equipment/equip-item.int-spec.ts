import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter } from '../../../test/fixtures';

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

        expect(codeOf(await equip(player, { itemId: 'abc' }))).toBe(
            'ITEM_NOT_OWNED',
        );
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
