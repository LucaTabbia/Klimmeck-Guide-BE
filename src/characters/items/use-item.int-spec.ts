import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import { ItemUseModule } from 'src/characters/items/item-use.module';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { LootItem } from 'src/models/loot-item.model';
import { Lore } from 'src/models/lore.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    persistLootItem,
    persistLore,
} from '../../../test/fixtures';

const USE_ITEM =
    'mutation UseItem($itemId: ID!) { useItem(itemId: $itemId) { hpBefore hpAfter injuriesHealed quantityLeft recoveryUntil loreUnlocked { id name type } } }';
const POTION_RECOVERY =
    'query($id: String!) { character(id: $id) { status { potionRecoveryUntil } } }';
const NOW = new Date('2026-11-10T12:00:00.000Z');
const FIRST_RECOVERY_END = '2026-11-10T12:30:00.000Z';
const LORE_NAME = 'Il limite del corpo';

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface RawStack {
    item: unknown;
    quantity: number;
}

interface RawCharacter {
    status: {
        currentLifePoints: number;
        injuries: string[];
        potionRecoveryUntil?: Date | null;
        unlockedLore?: unknown[];
    };
    assets: { ownedItems: RawStack[] };
}

interface Persisted {
    _id: Types.ObjectId;
    id: string;
}

interface PlayerShape {
    twitchId: string;
    role?: RoleType;
    status?: Record<string, unknown>;
    ownedItems?: RawStack[];
}

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

describe('useItem (wire)', () => {
    let harness: AuthTestApp;
    let clock: FixedClock;
    let characters: Model<CharacterDocument>;
    let lootItems: Model<any>;
    let lores: Model<any>;

    function stackOf(item: Types.ObjectId, quantity = 2): RawStack {
        return { item, quantity };
    }

    function playerWith(shape: PlayerShape): Promise<TestPlayer> {
        const base = buildCharacter();
        return createPlayer(harness, {
            twitchId: shape.twitchId,
            role: shape.role,
            characterOverrides: {
                status: {
                    ...base.status,
                    currentLifePoints: 400,
                    maxLifePoints: 1000,
                    injuries: ['deepCut', 'infection'],
                    ...shape.status,
                },
                assets: {
                    ...base.assets,
                    ownedItems: (shape.ownedItems ?? []).map((stack) => ({
                        itemType: 'LootItem',
                        ...stack,
                    })),
                },
            },
        });
    }

    async function potionWith(
        overrides: Record<string, unknown> = {},
    ): Promise<{ potion: Persisted; lore: Persisted }> {
        const lore = (await persistLore(lores, {
            name: LORE_NAME,
        })) as Persisted;
        const potion = (await persistLootItem(lootItems, {
            power: 300,
            canHeal: ['deepCut'],
            recovery: { time: 1_800_000, turns: 3 },
            relatedLore: [lore._id],
            ...overrides,
        })) as Persisted;
        return { potion, lore };
    }

    function idOf(player: TestPlayer): Types.ObjectId {
        return new Types.ObjectId(String(player.character?._id));
    }

    async function rawCharacter(player: TestPlayer): Promise<RawCharacter> {
        return (await characters
            .findById(idOf(player))
            .lean()
            .exec()) as unknown as RawCharacter;
    }

    async function drink(
        player: TestPlayer,
        itemId: string,
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            USE_ITEM,
            { itemId },
            player.bearer,
        );
        return response.body as WireBody;
    }

    function stackQuantity(
        character: RawCharacter,
        item: Types.ObjectId,
    ): number | undefined {
        return character.assets.ownedItems.find(
            (stack) => String(stack.item) === item.toHexString(),
        )?.quantity;
    }

    function wireLore(lore: Persisted) {
        return { id: lore.id, name: LORE_NAME, type: 'knowledge' };
    }

    beforeAll(async () => {
        clock = new FixedClock(NOW);
        harness = await createCharactersTestApp({
            clock,
            imports: [ItemUseModule],
        });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        lootItems = harness.connection.model(LootItem.name);
        lores = harness.connection.model(Lore.name);
    });

    beforeEach(() => {
        clock.advanceSeconds((NOW.getTime() - clock.now().getTime()) / 1000);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('drinks the first potion: life points, injury, stack, recovery and lore on the result and on the character (D-17)', async () => {
        const { potion, lore } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-first',
            ownedItems: [stackOf(potion._id)],
        });

        const body = await drink(player, potion.id);

        expect(body.errors).toBeUndefined();
        expect(body.data?.useItem).toEqual({
            hpBefore: 400,
            hpAfter: 700,
            injuriesHealed: ['deepCut'],
            quantityLeft: 1,
            recoveryUntil: FIRST_RECOVERY_END,
            loreUnlocked: [wireLore(lore)],
        });
        const after = await rawCharacter(player);
        expect(after.status.currentLifePoints).toBe(700);
        expect(after.status.injuries).toEqual(['infection']);
        expect(stackQuantity(after, potion._id)).toBe(1);
        expect(after.status.potionRecoveryUntil).toEqual(
            new Date(FIRST_RECOVERY_END),
        );
        expect(after.status.unlockedLore).toEqual([lore._id]);
    });

    it('refuses a second potion within the recovery with POTION_RECOVERING and the end instant (D-17)', async () => {
        const { potion } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-recovering',
            ownedItems: [stackOf(potion._id)],
        });
        await drink(player, potion.id);

        const body = await drink(player, potion.id);

        expect(body.errors?.[0]?.extensions).toEqual({
            code: 'POTION_RECOVERING',
            recoveryUntil: FIRST_RECOVERY_END,
        });
        expect(body.data).toBeNull();
        expect(stackQuantity(await rawCharacter(player), potion._id)).toBe(1);
    });

    it('drinks again once the recovery is over (D-15)', async () => {
        const { potion } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-again',
            ownedItems: [stackOf(potion._id)],
        });
        await drink(player, potion.id);
        clock.advanceSeconds(1800);

        const body = await drink(player, potion.id);

        expect(body.errors).toBeUndefined();
        expect(body.data?.useItem).toMatchObject({
            hpBefore: 700,
            hpAfter: 1000,
            quantityLeft: 0,
            recoveryUntil: '2026-11-10T13:00:00.000Z',
        });
    });

    it('unlocks the lore only with the first potion (D-19)', async () => {
        const { potion, lore } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-lore',
            ownedItems: [stackOf(potion._id)],
        });
        await drink(player, potion.id);
        clock.advanceSeconds(1800);

        const body = await drink(player, potion.id);

        expect(
            (body.data?.useItem as { loreUnlocked: unknown }).loreUnlocked,
        ).toEqual([]);
        expect((await rawCharacter(player)).status.unlockedLore).toEqual([
            lore._id,
        ]);
    });

    it('refuses a potion that would change nothing and writes nothing (D-23)', async () => {
        const { potion } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-no-effect',
            status: { currentLifePoints: 1000, injuries: ['infection'] },
            ownedItems: [stackOf(potion._id)],
        });
        const before = await rawCharacter(player);

        const body = await drink(player, potion.id);

        expect(codeOf(body)).toBe('ITEM_NO_EFFECT');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('refuses a character awaiting aid (D-17)', async () => {
        const { potion } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-awaiting-aid',
            status: {
                awaitingAid: {
                    quest: new Types.ObjectId(),
                    aidQuest: new Types.ObjectId(),
                    since: NOW,
                },
            },
            ownedItems: [stackOf(potion._id)],
        });
        const before = await rawCharacter(player);

        const body = await drink(player, potion.id);

        expect(codeOf(body)).toBe('AWAITING_AID');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it('drinks while travelling (D-17)', async () => {
        const { potion, lore } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-travelling',
            status: {
                activeTravel: {
                    road: {
                        coordinates: [
                            [0, 0],
                            [1, 1],
                        ],
                        distance: 10,
                    },
                    startTime: NOW,
                    endTime: new Date('2026-11-10T18:00:00.000Z'),
                    duration: 21_600_000,
                    to: new Types.ObjectId(),
                    kind: 'free',
                },
            },
            ownedItems: [stackOf(potion._id)],
        });

        const body = await drink(player, potion.id);

        expect(body.errors).toBeUndefined();
        expect(body.data?.useItem).toEqual({
            hpBefore: 400,
            hpAfter: 700,
            injuriesHealed: ['deepCut'],
            quantityLeft: 1,
            recoveryUntil: FIRST_RECOVERY_END,
            loreUnlocked: [wireLore(lore)],
        });
    });

    it('refuses an item the character does not own (D-17)', async () => {
        const { potion } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-unowned',
        });
        const before = await rawCharacter(player);

        const body = await drink(player, potion.id);

        expect(codeOf(body)).toBe('ITEM_NOT_OWNED');
        expect(await rawCharacter(player)).toEqual(before);
    });

    it.each([
        [
            'an item with another effect',
            async () => (await potionWith({ effect: 'hunger' })).potion,
        ],
        [
            'an item without a recovery',
            async () => (await potionWith({ recovery: null })).potion,
        ],
        [
            'a recovery of zero written by a content script',
            async () => {
                const { potion } = await potionWith();
                await lootItems.collection.updateOne(
                    { _id: potion._id },
                    { $set: { 'recovery.time': 0 } },
                );
                return potion;
            },
        ],
        [
            'a recovery beyond the GraphQL Int written by a content script',
            async () => {
                const { potion } = await potionWith();
                await lootItems.collection.updateOne(
                    { _id: potion._id },
                    { $set: { 'recovery.time': 9e15 } },
                );
                return potion;
            },
        ],
    ])(
        'refuses a loot item that cannot be drunk: %s (D-23)',
        async (_label, itemOf) => {
            const item = await itemOf();
            const player = await playerWith({
                twitchId: 'twitch-drink-not-usable',
                ownedItems: [stackOf(item._id)],
            });
            const before = await rawCharacter(player);

            const body = await drink(player, item.id);

            expect(codeOf(body)).toBe('ITEM_NOT_USABLE');
            expect(await rawCharacter(player)).toEqual(before);
        },
    );

    it('ignores an unknown injury written in canHeal by a content script (D-23)', async () => {
        const { potion } = await potionWith();
        await lootItems.collection.updateOne(
            { _id: potion._id },
            { $set: { canHeal: ['brokenWing', 'deepCut'] } },
        );
        const player = await playerWith({
            twitchId: 'twitch-drink-unknown-injury',
            ownedItems: [stackOf(potion._id)],
        });

        const body = await drink(player, potion.id);

        expect(body.errors).toBeUndefined();
        expect(
            (body.data?.useItem as { injuriesHealed: unknown }).injuriesHealed,
        ).toEqual(['deepCut']);
    });

    it('removes the stack at quantity 0 (D-17)', async () => {
        const { potion } = await potionWith();
        const other = new Types.ObjectId();
        const player = await playerWith({
            twitchId: 'twitch-drink-last',
            ownedItems: [stackOf(potion._id, 1), stackOf(other, 1)],
        });

        const body = await drink(player, potion.id);

        expect(
            (body.data?.useItem as { quantityLeft: unknown }).quantityLeft,
        ).toBe(0);
        const after = await rawCharacter(player);
        expect(stackQuantity(after, potion._id)).toBeUndefined();
        expect(stackQuantity(after, other)).toBe(1);
    });

    it('rejects a malformed item id with BAD_USER_INPUT (D-17)', async () => {
        const player = await playerWith({ twitchId: 'twitch-drink-bad-id' });

        const body = await drink(player, 'nope');

        expect(codeOf(body)).toBe('BAD_USER_INPUT');
    });

    it('answers NOT_FOUND to a user without a current character (D-21)', async () => {
        const { potion } = await potionWith();
        const player = await createPlayer(harness, {
            twitchId: 'twitch-drink-no-character',
            withCharacter: false,
        });

        const body = await drink(player, potion.id);

        expect(codeOf(body)).toBe('NOT_FOUND');
    });

    it('acts only on the character of the bearer, innkeeper included (D-21)', async () => {
        const { potion } = await potionWith();
        const innkeeper = await playerWith({
            twitchId: 'twitch-drink-innkeeper',
            role: RoleType.innkeeper,
            ownedItems: [stackOf(potion._id)],
        });
        const bystander = await playerWith({
            twitchId: 'twitch-drink-bystander',
            ownedItems: [stackOf(potion._id)],
        });
        const emptyHanded = await playerWith({
            twitchId: 'twitch-drink-empty-innkeeper',
            role: RoleType.innkeeper,
        });
        const bystanderBefore = await rawCharacter(bystander);

        const own = await drink(innkeeper, potion.id);
        const refused = await drink(emptyHanded, potion.id);

        expect(own.errors).toBeUndefined();
        expect(stackQuantity(await rawCharacter(innkeeper), potion._id)).toBe(
            1,
        );
        expect(codeOf(refused)).toBe('ITEM_NOT_OWNED');
        expect(await rawCharacter(bystander)).toEqual(bystanderBefore);
    });

    it('serves the end of the potion recovery on the character status (D-15)', async () => {
        const { potion } = await potionWith();
        const player = await playerWith({
            twitchId: 'twitch-drink-status',
            ownedItems: [stackOf(potion._id)],
        });
        const recoveryOf = async (): Promise<unknown> => {
            const response: request.Response = await graphqlRequest(
                harness.app,
                POTION_RECOVERY,
                { id: idOf(player).toHexString() },
                player.bearer,
            );
            const body = response.body as WireBody;
            return (body.data?.character as { status: Record<string, unknown> })
                .status.potionRecoveryUntil;
        };

        expect(await recoveryOf()).toBeNull();
        await drink(player, potion.id);
        expect(await recoveryOf()).toBe(FIRST_RECOVERY_END);
    });
});
