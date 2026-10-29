import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Schema } from 'mongoose';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
} from 'src/mongo/change-stream-publisher';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { AuthTestApp, createAuthTestApp } from '../auth/auth-test-app';

const REOPEN_PROBE = 'ReopenProbe';
const PRIMING_ATTEMPTS = 25;
const POLL_INTERVAL_MS = 500;
const REOPEN_DEADLINE_MS = 10_000;
const AFTER_DROP = 'after-drop';

interface ReopenProbeDocument {
    label: string;
}

const ReopenProbeSchema = new Schema<ReopenProbeDocument>(
    { label: String },
    { collection: 'reopenprobes' },
);

@Injectable()
class ReopenProbePublisher extends ChangeStreamPublisher<ReopenProbeDocument> {
    readonly labels: string[] = [];

    constructor(
        @InjectModel(REOPEN_PROBE) probeModel: Model<ReopenProbeDocument>,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(
            probeModel,
            {
                pipeline: [{ $match: { operationType: 'insert' } }],
                subject: 'delle sonde di riapertura',
            },
            pubSub,
        );
    }

    protected onChange(change: ChangeStreamEvent): void {
        const label = (change.fullDocument as ReopenProbeDocument | undefined)
            ?.label;
        if (label) this.labels.push(label);
    }
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('change stream reopen (D-17a)', () => {
    let harness: AuthTestApp;
    let probes: Model<ReopenProbeDocument>;
    let publisher: ReopenProbePublisher;

    async function insertUntilSeen(
        label: string,
        attempts: number,
    ): Promise<boolean> {
        for (let attempt = 0; attempt < attempts; attempt++) {
            await probes.create({ label });
            await pause(POLL_INTERVAL_MS);
            if (publisher.labels.includes(label)) return true;
        }
        return false;
    }

    beforeAll(async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: REOPEN_PROBE, schema: ReopenProbeSchema },
                ]),
            ],
            providers: [ReopenProbePublisher],
        });
        probes = harness.connection.model<ReopenProbeDocument>(REOPEN_PROBE);
        publisher = harness.app.get(ReopenProbePublisher);
    });

    afterAll(async () => {
        await harness.close();
        jest.restoreAllMocks();
    });

    it('publishes again after the watched collection is dropped', async () => {
        expect(await insertUntilSeen('sentinel', PRIMING_ATTEMPTS)).toBe(true);

        await harness.connection.db!.dropCollection('reopenprobes');

        const seen = await insertUntilSeen(
            AFTER_DROP,
            REOPEN_DEADLINE_MS / POLL_INTERVAL_MS,
        );
        expect(seen).toBe(true);
        expect(publisher.labels).toContain(AFTER_DROP);
    }, 30_000);
});
