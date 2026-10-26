import { Injectable } from '@nestjs/common';

// RNG iniettabile per tiri percentuali (D-02, D-16): RandomSource.pickIndex non basta; i test usano una sequenza fissa
export abstract class ChanceSource {
    // valore in [0, 1)
    abstract next(): number;
}

@Injectable()
export class MathChanceSource extends ChanceSource {
    next(): number {
        return Math.random();
    }
}
