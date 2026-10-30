import { Query, Resolver, Subscription } from '@nestjs/graphql';
import { Public } from 'src/auth/decorators/public.decorator';
import { GameRuleException } from 'src/gameRules/game-rule.exception';

export const PROBE_RAW_MESSAGE = 'E11000 duplicate key mongodb://user:pw@host';

// sonda solo-test: mai registrata in src; errori grezzi e codificati per la superficie di produzione
@Resolver()
export class ProductionProbeResolver {
    @Public()
    @Query(() => String)
    probeBoom(): string {
        throw new Error(PROBE_RAW_MESSAGE);
    }

    @Public()
    @Query(() => String)
    probeDomain(): string {
        throw GameRuleException.insufficientFunds();
    }

    @Public()
    @Query(() => String)
    boom(): string {
        return 'boom';
    }

    @Public()
    @Subscription(() => String)
    probeTicks(): AsyncIterableIterator<{ probeTicks: string }> {
        return failingIterator();
    }
}

// l'iteratore della subscription lancia al primo next: errore grezzo dentro lo stream
function failingIterator(): AsyncIterableIterator<{ probeTicks: string }> {
    return {
        [Symbol.asyncIterator]() {
            return this;
        },
        next: () => Promise.reject(new Error(PROBE_RAW_MESSAGE)),
        return: () => Promise.resolve({ done: true, value: undefined }),
    };
}
