import { Injectable } from '@nestjs/common';

export abstract class RandomSource {
    abstract pickIndex(length: number): number;
}

// scelta della città di partenza: non è un uso di sicurezza, Math.random basta
@Injectable()
export class MathRandomSource extends RandomSource {
    pickIndex(length: number): number {
        return Math.floor(Math.random() * length);
    }
}
