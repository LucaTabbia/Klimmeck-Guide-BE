import mongoose, { Schema } from 'mongoose';

/**
 * Harness proof: the shared MongoMemoryReplSet runs as a single-node replica set
 * (wiredTiger), which unlocks Mongo transactions and change streams — both
 * required by the atomicity and real-time features of the milestone.
 *
 * The mongoose connection is opened once by test/setup/after-env.ts (beforeAll).
 */

const harnessSchema = new Schema({
    name: { type: String, required: true },
    value: { type: Number, default: 0 },
});

// Reuse the model across tests to avoid OverwriteModelError.
const HarnessModel =
    mongoose.models.HarnessDoc || mongoose.model('HarnessDoc', harnessSchema);

describe('MongoMemoryReplSet harness', () => {
    beforeAll(async () => {
        // Creating a collection implicitly inside a multi-document transaction
        // conflicts on a replica set; pre-create the namespace up front.
        await HarnessModel.createCollection();
    });

    describe('transactions', () => {
        it('persists both documents written inside a committed transaction', async () => {
            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                await HarnessModel.create(
                    [{ name: 'tx-a', value: 1 }, { name: 'tx-b', value: 2 }],
                    { session, ordered: true },
                );
                // commitTransaction can surface a transient
                // UnknownTransactionCommitResult on a single-node memory replSet;
                // retry the commit until it settles.
                for (;;) {
                    try {
                        await session.commitTransaction();
                        break;
                    } catch (err: any) {
                        if (
                            typeof err?.hasErrorLabel === 'function' &&
                            err.hasErrorLabel('UnknownTransactionCommitResult')
                        ) {
                            continue;
                        }
                        throw err;
                    }
                }
            } catch (err) {
                if (session.inTransaction()) {
                    await session.abortTransaction();
                }
                throw err;
            } finally {
                await session.endSession();
            }

            const count = await HarnessModel.countDocuments({
                name: { $in: ['tx-a', 'tx-b'] },
            });
            expect(count).toBe(2);
        });

        it('rolls back on abort — no partial state is persisted', async () => {
            const session = await mongoose.startSession();
            session.startTransaction();
            await HarnessModel.create([{ name: 'tx-abort', value: 99 }], {
                session,
            });
            await session.abortTransaction();
            await session.endSession();

            const doc = await HarnessModel.findOne({ name: 'tx-abort' });
            expect(doc).toBeNull();
        });
    });

    describe('change streams', () => {
        it('emits an insert change event carrying the inserted document', async () => {
            const stream = HarnessModel.watch([
                { $match: { operationType: 'insert' } },
            ]);

            const changePromise = new Promise<any>((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error('change stream did not emit within timeout'));
                }, 8000);
                stream.on('change', (change) => {
                    clearTimeout(timer);
                    resolve(change);
                });
                stream.on('error', (err) => {
                    clearTimeout(timer);
                    reject(err);
                });
            });

            await HarnessModel.create({ name: 'cs-doc', value: 7 });

            const change = await changePromise;
            expect(change.operationType).toBe('insert');
            expect(change.fullDocument?.name).toBe('cs-doc');

            await stream.close();
        });
    });
});
