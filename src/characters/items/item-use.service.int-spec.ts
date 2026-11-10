import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { ItemUseModule } from 'src/characters/items/item-use.module';
import { ItemUseService } from 'src/characters/items/item-use.service';
import { Character } from 'src/models/character/character.model';
import { LootItem } from 'src/models/loot-item.model';
import { AuthTestApp } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter, persistLootItem } from '../../../test/fixtures';

const NOW = new Date('2026-11-10T12:00:00.000Z');

interface RawStack {
    item: unknown;
    quantity: number;
}

interface RawCharacter {
    status: { currentLifePoints: number };
    assets: { ownedItems: RawStack[] };
}

interface ShelfDocument {
    _id: Types.ObjectId;
    assets: {
        ownedItems: {
            itemType: string;
            item: Types.ObjectId;
            quantity: number;
        }[];
    };
}

describe('ItemUseService (replSet)', () => {
    let harness: AuthTestApp;
    let service: ItemUseService;
    let characters: Model<any>;
    let lootItems: Model<any>;

    async function potionId(): Promise<Types.ObjectId> {
        const potion = (await persistLootItem(lootItems, {
            power: 300,
            canHeal: ['deepCut'],
            recovery: { time: 1_800_000, turns: 3 },
        })) as { _id: Types.ObjectId };
        return potion._id;
    }

    function drinkerWith(
        twitchId: string,
        potion: Types.ObjectId,
    ): Promise<TestPlayer> {
        const base = buildCharacter();
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                status: {
                    ...base.status,
                    currentLifePoints: 400,
                    maxLifePoints: 1000,
                    injuries: ['deepCut'],
                },
                assets: {
                    ...base.assets,
                    ownedItems: [
                        { itemType: 'LootItem', item: potion, quantity: 2 },
                    ],
                },
            },
        });
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

    function quantityOf(
        character: RawCharacter,
        item: Types.ObjectId,
    ): number | undefined {
        return character.assets.ownedItems.find(
            (stack) => String(stack.item) === item.toHexString(),
        )?.quantity;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            clock: new FixedClock(NOW),
            imports: [ItemUseModule],
        });
        service = harness.app.get(ItemUseService);
        characters = harness.app.get<Model<any>>(getModelToken(Character.name));
        lootItems = harness.connection.model(LootItem.name);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('lets one of two parallel drinks write and answers the other with POTION_RECOVERING (D-22)', async () => {
        const potion = await potionId();
        const player = await drinkerWith('twitch-race-drink', potion);
        const userId = String(player.user._id);

        const settled = await Promise.allSettled([
            service.useItem(userId, potion.toHexString()),
            service.useItem(userId, potion.toHexString()),
        ]);

        const fulfilled = settled.filter(
            (result) => result.status === 'fulfilled',
        );
        const rejected = settled.filter(
            (result): result is PromiseRejectedResult =>
                result.status === 'rejected',
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(
            (rejected[0].reason as { extensions: { code: string } }).extensions
                .code,
        ).toBe('POTION_RECOVERING');
        const after = await rawCharacter(player);
        expect(quantityOf(after, potion)).toBe(1);
        expect(after.status.currentLifePoints).toBe(700);
    });

    it('writes the character once, inside the transaction (D-22)', async () => {
        const potion = await potionId();
        const player = await drinkerWith('twitch-single-write', potion);
        const updateOne = jest.spyOn(characters, 'updateOne');

        await service.useItem(String(player.user._id), potion.toHexString());

        expect(updateOne).toHaveBeenCalledTimes(1);
        const options = (updateOne.mock.calls[0] as unknown[])[2] as {
            session?: unknown;
        };
        expect(options.session).toBeDefined();
        expect(options.session).not.toBeNull();
    });

    it('keeps an inventory write that lands during the drink (D-22)', async () => {
        const potion = await potionId();
        const other = new Types.ObjectId();
        const player = await drinkerWith('twitch-concurrent-inventory', potion);
        const shelves = harness.connection.db!.collection<ShelfDocument>(
            characters.collection.collectionName,
        );

        await Promise.all([
            service.useItem(String(player.user._id), potion.toHexString()),
            shelves.updateOne(
                { _id: idOf(player) },
                {
                    $push: {
                        'assets.ownedItems': {
                            itemType: 'LootItem',
                            item: other,
                            quantity: 1,
                        },
                    },
                },
            ),
        ]);

        const after = await rawCharacter(player);
        expect(quantityOf(after, other)).toBe(1);
        expect(quantityOf(after, potion)).toBe(1);
    });

    // stati scritti col driver nativo (D-23): il piano li accetta, la scrittura deve combaciare invece di un ITEM_NOT_OWNED perpetuo
    it.each<[string, Record<string, unknown>]>([
        [
            'a recovery stored as text',
            { $set: { 'status.potionRecoveryUntil': 'soon' } },
        ],
        [
            'a recovery stored as a number',
            { $set: { 'status.potionRecoveryUntil': 42 } },
        ],
        [
            'a legacy without the recovery field',
            { $unset: { 'status.potionRecoveryUntil': '' } },
        ],
        [
            'a legacy without the injuries field',
            { $unset: { 'status.injuries': '' } },
        ],
    ])(
        'lets %s drink and stores a real recovery date (D-22, D-23)',
        async (_case, rawUpdate) => {
            const potion = await potionId();
            const player = await drinkerWith('twitch-raw-drinker', potion);
            await characters.collection.updateOne(
                { _id: idOf(player) },
                rawUpdate,
            );

            const result = await service.useItem(
                String(player.user._id),
                potion.toHexString(),
            );

            expect(result.hpAfter).toBe(700);
            const raw = await characters.collection.findOne({
                _id: idOf(player),
            });
            expect(raw?.status.potionRecoveryUntil).toEqual(
                new Date(NOW.getTime() + 1_800_000),
            );
            expect(raw?.assets.ownedItems[0].quantity).toBe(1);
        },
    );

    it('answers ITEM_NOT_OWNED when the guarded write matches nothing (D-22)', async () => {
        const potion = await potionId();
        const player = await drinkerWith('twitch-guard-miss', potion);
        const before = await rawCharacter(player);
        jest.spyOn(characters, 'updateOne').mockReturnValueOnce({
            exec: () =>
                Promise.resolve({
                    acknowledged: true,
                    matchedCount: 0,
                    modifiedCount: 0,
                    upsertedCount: 0,
                    upsertedId: null,
                }),
        } as never);

        await expect(
            service.useItem(String(player.user._id), potion.toHexString()),
        ).rejects.toMatchObject({ extensions: { code: 'ITEM_NOT_OWNED' } });
        expect(await rawCharacter(player)).toEqual(before);
    });
});
