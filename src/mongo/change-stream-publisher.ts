import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model, mongo } from 'mongoose';
import type { PubSubEvents } from 'src/pubsub.module';
import { describeError } from './mongo-errors';
import { reopenDelayMs } from './reopen-backoff';

// ChangeStreamHistoryLost: il token di ripresa è uscito dall'oplog
const CHANGE_STREAM_HISTORY_LOST = 286;

export interface ChangeStreamEvent {
    _id?: unknown;
    documentKey?: unknown;
    fullDocument?: unknown;
}

export interface ChangeStreamSpec {
    pipeline: Record<string, unknown>[];
    options?: mongo.ChangeStreamOptions;
    // complemento della collection nei log («delle quest»)
    subject: string;
}

type PubSubKey = Extract<keyof PubSubEvents, string>;

type WatchedStream<TDocument> = ReturnType<Model<TDocument>['watch']>;

// ciclo di vita condiviso dei publisher su change stream: le sottoclassi dicono solo cosa osservare e cosa pubblicare;
// uno stream chiuso da un errore non riprendibile o da un invalidate si riapre con backoff dopo l'ultimo evento visto (D-17a)
export abstract class ChangeStreamPublisher<TDocument>
    implements OnModuleInit, OnModuleDestroy
{
    protected readonly logger = new Logger(this.constructor.name);
    private changeStream?: WatchedStream<TDocument>;
    private resumeToken?: unknown;
    private attempt = 0;
    private reopenTimer?: NodeJS.Timeout;
    private closing = false;

    protected constructor(
        private readonly model: Model<TDocument>,
        private readonly spec: ChangeStreamSpec,
        private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    onModuleInit(): void {
        this.openOrRetry();
    }

    // una lettura già partita non pubblica su un'app in chiusura; il listener di error resta (un error senza listener abbatte il processo)
    async onModuleDestroy(): Promise<void> {
        this.closing = true;
        clearTimeout(this.reopenTimer);
        this.reopenTimer = undefined;
        const stream = this.changeStream;
        this.changeStream = undefined;
        if (!stream) return;
        this.detach(stream);
        await stream.close();
    }

    protected get stopping(): boolean {
        return this.closing;
    }

    protected publish<TKey extends PubSubKey>(
        routingKey: TKey,
        ...args: PubSubEvents[TKey]
    ): void {
        if (this.closing) return;
        this.pubSub.publish(routingKey, ...args);
    }

    protected abstract onChange(change: ChangeStreamEvent): void;

    // gli eventi nel buco non tornano: chi ha una risincronizzazione completa a basso costo la fa qui, gli altri restano col WARN
    protected onHistoryLost(): void {}

    // un watch che lancia in modo sincrono segue lo stesso backoff di uno stream caduto
    private openOrRetry(): void {
        try {
            this.open();
        } catch (error) {
            this.scheduleReopen(error);
        }
    }

    private open(): void {
        const stream = this.watch();
        this.changeStream = stream;
        stream.on('change', (change: ChangeStreamEvent) =>
            this.receive(change),
        );
        // il driver avanza il token anche oltre gli eventi filtrati (un invalidate non arriva come change):
        // un token nuovo prova che il cursore è vivo, quindi il backoff riparte da capo anche su una collection quieta
        stream.on('resumeTokenChanged', (token: unknown) => {
            if (stream !== this.changeStream || !token) return;
            this.resumeToken = token;
            this.attempt = 0;
        });
        stream.on('error', (error: unknown) => {
            if (stream === this.changeStream) this.scheduleReopen(error);
        });
        stream.on('close', () => {
            if (stream === this.changeStream) this.scheduleReopen(undefined);
        });
    }

    private watch(): WatchedStream<TDocument> {
        const { pipeline, options } = this.spec;
        if (this.resumeToken === undefined) {
            return options
                ? this.model.watch(pipeline, options)
                : this.model.watch(pipeline);
        }
        return this.model.watch(pipeline, {
            ...options,
            startAfter: this.resumeToken,
        });
    }

    private receive(change: ChangeStreamEvent): void {
        if (this.closing) return;
        this.resumeToken = change._id;
        this.attempt = 0;
        this.onChange(change);
    }

    private scheduleReopen(error: unknown): void {
        if (this.closing || this.reopenTimer) return;
        const delayMs = reopenDelayMs(this.attempt);
        if (isHistoryLost(error)) this.forgetHistory();
        else this.logReopen(error, delayMs);
        this.abandonCurrentStream();
        this.reopenTimer = setTimeout(() => {
            this.reopenTimer = undefined;
            this.attempt++;
            this.openOrRetry();
        }, delayMs).unref();
    }

    private forgetHistory(): void {
        this.resumeToken = undefined;
        this.logger.warn(
            `Storia del change stream ${this.spec.subject} persa: riapertura senza ripresa`,
        );
        this.onHistoryLost();
    }

    private logReopen(error: unknown, delayMs: number): void {
        const cause =
            error === undefined ? 'chiusura inattesa' : describeError(error);
        this.logger.error(
            `Change stream ${this.spec.subject} chiuso (${cause}): riapertura n. ${this.attempt + 1} fra ${delayMs} ms`,
        );
    }

    private abandonCurrentStream(): void {
        const stream = this.changeStream;
        this.changeStream = undefined;
        if (!stream) return;
        this.detach(stream);
        stream.close().catch(() => undefined);
    }

    private detach(stream: WatchedStream<TDocument>): void {
        stream.removeAllListeners('change');
        stream.removeAllListeners('resumeTokenChanged');
        stream.removeAllListeners('close');
    }
}

function isHistoryLost(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === CHANGE_STREAM_HISTORY_LOST
    );
}
