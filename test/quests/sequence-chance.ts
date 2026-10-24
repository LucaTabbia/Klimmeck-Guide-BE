import { ChanceSource } from 'src/quests/outcomes/chance-source';

export class SequenceChance extends ChanceSource {
    readonly drawn: number[] = [];
    private values: number[];
    private index = 0;

    // sequenza esaurita ⇒ fallback 0.99: nessun drop, nessun evento casuale
    constructor(
        values: readonly number[] = [],
        private readonly fallback = 0.99,
    ) {
        super();
        this.values = [...values];
    }

    next(): number {
        const value = this.values[this.index++] ?? this.fallback;
        this.drawn.push(value);
        return value;
    }

    load(values: readonly number[]): void {
        this.values = [...values];
        this.index = 0;
        this.drawn.length = 0;
    }
}
