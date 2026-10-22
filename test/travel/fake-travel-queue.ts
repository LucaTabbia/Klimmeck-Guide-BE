interface FakeTravelJob {
    id: string;
    remove: () => Promise<void>;
}

// sostituisce la coda Bull 'travel' (override di getQueueToken(TRAVEL_QUEUE)): nessun Redis; l'explorer di @nestjs/bull chiama process una volta
export class FakeTravelQueue {
    readonly added: Array<{
        name: string;
        data: unknown;
        options: Record<string, unknown>;
    }> = [];
    readonly removed: string[] = [];
    readonly jobs = new Map<string, FakeTravelJob>();
    failAdd = false;
    failRemove = false;
    hangAdd = false;
    hangRemove = false;
    private readonly listeners = new Map<
        string,
        Array<(...args: unknown[]) => void>
    >();

    add = jest.fn(
        (
            name: string,
            data: unknown,
            options: Record<string, unknown>,
        ): Promise<FakeTravelJob> => {
            if (this.failAdd)
                return Promise.reject(new Error('queue unavailable'));
            if (this.hangAdd)
                return new Promise<FakeTravelJob>(() => undefined);
            this.added.push({ name, data, options });
            const id = String(options.jobId);
            const job: FakeTravelJob = {
                id,
                remove: () => {
                    if (this.hangRemove)
                        return new Promise<void>(() => undefined);
                    if (this.failRemove)
                        return Promise.reject(
                            new Error(`Could not remove job ${id}`),
                        );
                    this.jobs.delete(id);
                    this.removed.push(id);
                    return Promise.resolve();
                },
            };
            this.jobs.set(id, job);
            return Promise.resolve(job);
        },
    );
    getJob = jest.fn(
        (id: string): Promise<FakeTravelJob | null> =>
            Promise.resolve(this.jobs.get(id) ?? null),
    );
    process = jest.fn();
    on = jest.fn(
        (event: string, listener: (...args: unknown[]) => void): this => {
            this.listeners.set(event, [
                ...(this.listeners.get(event) ?? []),
                listener,
            ]);
            return this;
        },
    );

    emit(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? [])
            listener(...args);
    }

    reset(): void {
        this.added.length = 0;
        this.removed.length = 0;
        this.jobs.clear();
        this.failAdd = false;
        this.failRemove = false;
        this.hangAdd = false;
        this.hangRemove = false;
        // i listener si registrano una volta al boot (onModuleInit): reset non li tocca
        this.add.mockClear();
        this.getJob.mockClear();
        this.process.mockClear();
        this.on.mockClear();
    }
}
