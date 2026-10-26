// single-flight per chiave con rerun: al più un'esecuzione in corso e una in coda per chiave, e l'ultima parte
// dopo l'ultima richiesta (una raffica costa al più due letture e l'ultimo publish riflette lo stato più recente)
export class KeyedSingleFlight {
    private readonly inFlight = new Map<string, Promise<void>>();
    private readonly dirty = new Set<string>();

    constructor(private readonly run: (key: string) => Promise<void>) {}

    request(key: string): void {
        this.dirty.add(key);
        if (!this.inFlight.has(key)) {
            this.inFlight.set(key, this.drain(key));
        }
    }

    private async drain(key: string): Promise<void> {
        try {
            while (this.dirty.delete(key)) {
                await this.run(key);
            }
        } finally {
            this.inFlight.delete(key);
        }
    }
}
