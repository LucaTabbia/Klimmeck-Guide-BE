import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { Quest } from 'src/models/quest/quest.model';
import { healHasNoEffect } from 'src/quests/outcomes/injuries/heal-no-effect';
import { ViewerVitalsService } from './viewer-vitals.service';

// foglio strappato (Phase 18 D-25): vero solo per una heal senza effetto per il personaggio corrente del bearer;
// stesso predicato del rifiuto di acceptQuest; la FE non calcola nulla
@Resolver(() => Quest)
export class QuestNoEffectResolver {
    constructor(private readonly vitals: ViewerVitalsService) {}

    @ResolveField('noEffect', () => Boolean)
    async noEffect(
        @Parent() quest: Quest,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<boolean> {
        if (quest.infos?.type !== QuestType.heal) return false;
        const subject = await this.vitals.of(identity, context, info);
        if (subject === null) return false;
        return healHasNoEffect(subject, quest.prizes?.cure);
    }
}
