import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Pet } from 'src/models/pet.model';
import { knowsAnyLoreOf } from './lore-visibility';
import { ViewerKnowledgeService } from './viewer-knowledge.service';

// pet conosciuto dal viewer (UAT 2026-11-15): decide il BE se la FE apre il foglio e mostra l'immagine;
// stessa visibilità di Pet.relatedLore, una lettura del viewer per richiesta o per evento, nessuna query delle lore
@Resolver(() => Pet)
export class KnownPetsResolver {
    constructor(private readonly viewers: ViewerKnowledgeService) {}

    @ResolveField('known', () => Boolean)
    async known(
        @Parent() pet: Pet,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<boolean> {
        return knowsAnyLoreOf(
            await this.viewers.of(identity, context, info),
            pet.relatedLore,
        );
    }
}
