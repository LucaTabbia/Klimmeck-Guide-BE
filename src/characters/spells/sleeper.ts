import { Injectable } from '@nestjs/common';

// attesa iniettabile come Clock: i test la sostituiscono, mai un ciclo attivo
export abstract class Sleeper {
    abstract sleep(ms: number): Promise<void>;
}

@Injectable()
export class TimerSleeper extends Sleeper {
    sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
