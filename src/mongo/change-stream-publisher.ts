import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model, mongo } from 'mongoose';
import type { PubSubEvents } from 'src/pubsub.module';
import { describeError } from './mongo-errors';

export interface ChangeStreamEvent {
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

// ciclo di vita condiviso dei publisher su change stream: le sottoclassi dicono solo cosa osservare e cosa pubblicare
export abstract class ChangeStreamPublisher<TDocument>
    implements OnModuleInit, OnModuleDestroy
{
    protected readonly logger = new Logger(this.constructor.name);
    private changeStream?: ReturnType<Model<TDocument>['watch']>;
    private closing = false;

    protected constructor(
        private readonly model: Model<TDocument>,
        private readonly spec: ChangeStreamSpec,
        private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    onModuleInit(): void {
        const { pipeline, options, subject } = this.spec;
        this.changeStream = options
            ? this.model.watch(pipeline, options)
            : this.model.watch(pipeline);
        this.changeStream.on('change', (change: ChangeStreamEvent) => {
            if (!this.closing) this.onChange(change);
        });
        this.changeStream.on('error', (error: unknown) =>
            this.logger.error(
                `Errore nel change stream ${subject}: ${describeError(error)}`,
            ),
        );
    }

    // una lettura già partita non pubblica su un'app in chiusura; il listener di error resta (un error senza listener abbatte il processo)
    async onModuleDestroy(): Promise<void> {
        this.closing = true;
        await this.changeStream?.close();
        this.changeStream?.removeAllListeners('change');
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
}
