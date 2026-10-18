import { INestApplication } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import type { CoinPurse } from 'src/economy/coins';
import { EconomyModule } from 'src/economy/economy.module';
import { WalletService } from 'src/economy/wallet.service';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { User, UserDocument } from 'src/models/user.model';
import {
    buildCharacter,
    persistCharacter,
    persistUser,
} from '../../test/fixtures';

const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');

describe('WalletService (replSet)', () => {
    let app: INestApplication;
    let wallet: WalletService;
    let connection: Connection;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'economy-wallet-test',
                }),
                EconomyModule,
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        wallet = app.get(WalletService);
        connection = app.get<Connection>(getConnectionToken());
        characters = app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        users = app.get<Model<UserDocument>>(getModelToken(User.name));
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all([characters.init(), users.init()]);
    });

    afterEach(async () => {
        await Promise.all([characters.deleteMany({}), users.deleteMany({})]);
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    async function persistWithCoins(
        coins: CoinPurse,
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const character = await persistCharacter(characters, {
            status: { ...buildCharacter().status, coins },
            ...overrides,
        });
        return character._id as Types.ObjectId;
    }

    async function rawCoins(id: Types.ObjectId): Promise<unknown> {
        return (await characters.collection.findOne({ _id: id }))?.status.coins;
    }

    function intTyped(id: Types.ObjectId): Promise<number> {
        return characters.collection.countDocuments({
            _id: id,
            'status.coins.gold': { $type: 'int' },
            'status.coins.silver': { $type: 'int' },
            'status.coins.copper': { $type: 'int' },
        });
    }

    describe('applyCharacterCoinsDelta', () => {
        it('debits a sufficient balance and returns the normalized purse', async () => {
            const id = await persistWithCoins({
                gold: 1,
                silver: 0,
                copper: 5,
            });

            await expect(
                wallet.applyCharacterCoinsDelta(id, -150),
            ).resolves.toEqual({ gold: 0, silver: 98, copper: 55 });
            expect(await rawCoins(id)).toEqual({
                gold: 0,
                silver: 98,
                copper: 55,
            });
            expect(await intTyped(id)).toBe(1);
        });

        it('credits and carries into the higher denominations', async () => {
            const id = await persistWithCoins({
                gold: 0,
                silver: 99,
                copper: 99,
            });

            await expect(
                wallet.applyCharacterCoinsDelta(id, 1),
            ).resolves.toEqual({ gold: 1, silver: 0, copper: 0 });
            expect(await intTyped(id)).toBe(1);
        });

        it('rejects an insufficient debit with INSUFFICIENT_FUNDS and leaves the purse untouched', async () => {
            const id = await persistWithCoins({
                gold: 0,
                silver: 1,
                copper: 0,
            });

            await expect(
                wallet.applyCharacterCoinsDelta(id, -101),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
            expect(await rawCoins(id)).toEqual({
                gold: 0,
                silver: 1,
                copper: 0,
            });
        });

        it('answers NOT_FOUND for a missing character', async () => {
            const missing = new Types.ObjectId();

            await expect(
                wallet.applyCharacterCoinsDelta(missing, -1),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(
                wallet.applyCharacterCoinsDelta(missing, 1),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        });

        it('answers NOT_FOUND for an archived character and writes nothing', async () => {
            const id = await persistWithCoins(
                { gold: 0, silver: 1, copper: 0 },
                { deletedAt: ARCHIVED_AT, deletionReason: 'user_request' },
            );

            await expect(
                wallet.applyCharacterCoinsDelta(id, -10),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(
                wallet.applyCharacterCoinsDelta(id, 10),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(await rawCoins(id)).toEqual({
                gold: 0,
                silver: 1,
                copper: 0,
            });
        });

        it('never goes negative under concurrent debits', async () => {
            const id = await persistWithCoins({
                gold: 0,
                silver: 1,
                copper: 0,
            });

            const results = await Promise.allSettled(
                Array.from({ length: 10 }, () =>
                    wallet.applyCharacterCoinsDelta(id, -30),
                ),
            );

            const fulfilled = results.filter((r) => r.status === 'fulfilled');
            const rejected = results.filter(
                (r): r is PromiseRejectedResult => r.status === 'rejected',
            );
            expect(fulfilled).toHaveLength(3);
            expect(rejected).toHaveLength(7);
            expect(
                rejected.every(
                    (r) =>
                        (r.reason as { code?: string }).code ===
                        'INSUFFICIENT_FUNDS',
                ),
            ).toBe(true);
            expect(await rawCoins(id)).toEqual({
                gold: 0,
                silver: 0,
                copper: 10,
            });
        });

        it('treats a zero delta as a no-op that reports the balance', async () => {
            const id = await persistWithCoins({
                gold: 0,
                silver: 2,
                copper: 3,
            });

            await expect(
                wallet.applyCharacterCoinsDelta(id, 0),
            ).resolves.toEqual({ gold: 0, silver: 2, copper: 3 });
            expect(await rawCoins(id)).toEqual({
                gold: 0,
                silver: 2,
                copper: 3,
            });
        });

        it('rejects a non-integer delta with a RangeError before writing', async () => {
            const id = await persistWithCoins({
                gold: 0,
                silver: 2,
                copper: 3,
            });

            await expect(
                wallet.applyCharacterCoinsDelta(id, 1.5),
            ).rejects.toBeInstanceOf(RangeError);
            expect(await rawCoins(id)).toEqual({
                gold: 0,
                silver: 2,
                copper: 3,
            });
        });

        it('rolls the debit back when the surrounding transaction aborts', async () => {
            const id = await persistWithCoins({
                gold: 0,
                silver: 1,
                copper: 0,
            });

            await expect(
                connection.transaction(async (session) => {
                    await wallet.applyCharacterCoinsDelta(id, -50, session);
                    throw new Error('abort');
                }),
            ).rejects.toThrow('abort');
            expect(await rawCoins(id)).toEqual({
                gold: 0,
                silver: 1,
                copper: 0,
            });
        });

        it('classifies inside the session: INSUFFICIENT_FUNDS within a transaction', async () => {
            const id = await persistWithCoins({
                gold: 0,
                silver: 1,
                copper: 0,
            });

            await expect(
                connection.transaction((session) =>
                    wallet.applyCharacterCoinsDelta(id, -1000, session),
                ),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
        });
    });
    describe('twitchPoints', () => {
        async function persistWithPoints(
            points: number,
            twitchId: string,
        ): Promise<Types.ObjectId> {
            const user = await persistUser(users, {
                twitchId,
                twitchPoints: points,
            });
            return user._id as Types.ObjectId;
        }

        async function rawPoints(id: Types.ObjectId): Promise<unknown> {
            return (await users.collection.findOne({ _id: id }))?.twitchPoints;
        }

        it('debits sufficient points and returns the new balance', async () => {
            const id = await persistWithPoints(50, 'twitch-wallet-debit');

            await expect(wallet.debitUserPoints(id, 20)).resolves.toBe(30);
            expect(await rawPoints(id)).toBe(30);
        });

        it('rejects an insufficient debit with INSUFFICIENT_POINTS and leaves the balance untouched', async () => {
            const id = await persistWithPoints(10, 'twitch-wallet-short');

            await expect(wallet.debitUserPoints(id, 11)).rejects.toMatchObject({
                code: 'INSUFFICIENT_POINTS',
            });
            expect(await rawPoints(id)).toBe(10);
        });

        it('treats a user without the twitchPoints field as having no points', async () => {
            const { insertedId } = await users.collection.insertOne({
                twitchId: 'twitch-wallet-nofield',
                role: 'adventurer',
                currentCharacter: null,
            });

            await expect(
                wallet.debitUserPoints(insertedId, 1),
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_POINTS' });
            await expect(wallet.creditUserPoints(insertedId, 5)).resolves.toBe(
                5,
            );
            expect(await rawPoints(insertedId)).toBe(5);
        });

        it('answers NOT_FOUND for a missing user', async () => {
            const missing = new Types.ObjectId();

            await expect(
                wallet.debitUserPoints(missing, 1),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(
                wallet.creditUserPoints(missing, 1),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        });

        it('never goes negative under concurrent debits', async () => {
            const id = await persistWithPoints(50, 'twitch-wallet-race');

            const results = await Promise.allSettled(
                Array.from({ length: 4 }, () => wallet.debitUserPoints(id, 20)),
            );

            const fulfilled = results.filter((r) => r.status === 'fulfilled');
            const rejected = results.filter(
                (r): r is PromiseRejectedResult => r.status === 'rejected',
            );
            expect(fulfilled).toHaveLength(2);
            expect(rejected).toHaveLength(2);
            expect(
                rejected.every(
                    (r) =>
                        (r.reason as { code?: string }).code ===
                        'INSUFFICIENT_POINTS',
                ),
            ).toBe(true);
            expect(await rawPoints(id)).toBe(10);
        });

        it('credits points without a guard', async () => {
            const id = await persistWithPoints(0, 'twitch-wallet-credit');

            await expect(wallet.creditUserPoints(id, 7)).resolves.toBe(7);
            expect(await rawPoints(id)).toBe(7);
        });

        it.each([0, -5, 2.5])(
            'rejects non-positive or fractional amounts with a RangeError (%p)',
            async (amount) => {
                const id = await persistWithPoints(50, 'twitch-wallet-range');

                await expect(
                    wallet.debitUserPoints(id, amount),
                ).rejects.toBeInstanceOf(RangeError);
                await expect(
                    wallet.creditUserPoints(id, amount),
                ).rejects.toBeInstanceOf(RangeError);
                expect(await rawPoints(id)).toBe(50);
            },
        );

        it('rolls the points debit back when the surrounding transaction aborts', async () => {
            const id = await persistWithPoints(50, 'twitch-wallet-rollback');

            await expect(
                connection.transaction(async (session) => {
                    await wallet.debitUserPoints(id, 20, session);
                    throw new Error('abort');
                }),
            ).rejects.toThrow('abort');
            expect(await rawPoints(id)).toBe(50);
        });
    });
});
