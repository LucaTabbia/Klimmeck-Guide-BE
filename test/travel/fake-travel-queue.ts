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

    add = jest.fn(
        (
            name: string,
            data: unknown,
            options: Record<string, unknown>,
        ): Promise<FakeTravelJob> => {
            if (this.failAdd)
                return Promise.reject(new Error('queue unavailable'));
            this.added.push({ name, data, options });
            const id = String(options.jobId);
            const job: FakeTravelJob = {
                id,
                remove: () => {
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
    on = jest.fn();

    reset(): void {
        this.added.length = 0;
        this.removed.length = 0;
        this.jobs.clear();
        this.failAdd = false;
        this.failRemove = false;
        this.add.mockClear();
        this.getJob.mockClear();
        this.process.mockClear();
        this.on.mockClear();
    }
}
