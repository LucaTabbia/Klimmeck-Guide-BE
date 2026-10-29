import { Query, Resolver } from '@nestjs/graphql';
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
}
