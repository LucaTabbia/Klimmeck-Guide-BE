import { Query, Resolver } from '@nestjs/graphql';
import { Clock } from 'src/auth/clock';

// ancora del countdown FE (07 D-15): il client calcola l'offset device↔server, nessun timestamp nel payload delle entità
@Resolver()
export class ServerTimeResolver {
    constructor(private readonly clock: Clock) {}

    @Query(() => Date)
    serverTime(): Date {
        return this.clock.now();
    }
}
