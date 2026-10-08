import { Clock } from 'src/auth/clock';

const MILLISECONDS_PER_SECOND = 1000;

export class FixedClock extends Clock {
    private current: Date;

    constructor(start: Date = new Date()) {
        super();
        this.current = new Date(start.getTime());
    }

    now(): Date {
        return new Date(this.current.getTime());
    }

    advanceSeconds(seconds: number): void {
        this.current = new Date(
            this.current.getTime() + seconds * MILLISECONDS_PER_SECOND,
        );
    }
}
