import { RandomSource } from 'src/characters/creation/random-source';

export class FixedRandomSource extends RandomSource {
    readonly requestedLengths: number[] = [];

    constructor(private index = 0) {
        super();
    }

    setIndex(index: number): void {
        this.index = index;
    }

    pickIndex(length: number): number {
        this.requestedLengths.push(length);
        return this.index % length;
    }
}
