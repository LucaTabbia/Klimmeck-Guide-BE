// lascia passare un messaggio per intervallo e conta quelli soppressi nel frattempo
export class LogThrottle {
    private lastAdmittedAt: number | null = null;
    private suppressed = 0;

    constructor(private readonly intervalMs: number) {}

    // null = da sopprimere; altrimenti quanti messaggi sono stati soppressi dall'ultimo ammesso
    admit(now: Date): number | null {
        const at = now.getTime();
        if (
            this.lastAdmittedAt !== null &&
            at - this.lastAdmittedAt < this.intervalMs
        ) {
            this.suppressed += 1;
            return null;
        }
        const suppressed = this.suppressed;
        this.lastAdmittedAt = at;
        this.suppressed = 0;
        return suppressed;
    }
}
