import { ChanceSource } from 'src/quests/outcomes/chance-source';

// mulberry32: stesso seme = stessa sequenza, così i sorteggi del generatore si rifanno identici (T-11-31)
export class SeededChanceSource extends ChanceSource {
    private state: number;

    constructor(seed: number) {
        super();
        this.state = seed >>> 0;
    }

    next(): number {
        let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    pick<T>(items: readonly T[]): T | undefined {
        if (items.length === 0) return undefined;
        return items[Math.floor(this.next() * items.length)];
    }

    // Fisher–Yates: ogni permutazione dipende solo dal seme
    shuffle<T>(items: readonly T[]): T[] {
        const shuffled = [...items];
        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swap = Math.floor(this.next() * (index + 1));
            [shuffled[index], shuffled[swap]] = [
                shuffled[swap],
                shuffled[index],
            ];
        }
        return shuffled;
    }
}

// FNV-1a a 32 bit sui code point: trasforma la chiave di una quest in un seme
function fnv1a32(text: string): number {
    let hash = 0x811c9dc5;
    for (const char of text) {
        hash ^= char.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
}

// flusso separato per quest: le estrazioni di sapore non spostano i sorteggi del generatore (T-11-31)
// e una quest tiene la sua variante anche se altre quest cambiano
export function keyedChance(seed: number, key: string): SeededChanceSource {
    return new SeededChanceSource((seed ^ fnv1a32(key)) >>> 0);
}
