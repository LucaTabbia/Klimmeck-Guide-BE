import { Mutation, Resolver } from '@nestjs/graphql';
import { AuditTarget } from 'src/authz/audit/audit-target.decorator';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';
import { GenerateQuestsResult } from 'src/models/quest/generate-quests-result.model';
import { QuestGenerator } from './quest-generator.service';

@Resolver()
export class QuestGenerationResolver {
    constructor(private readonly generator: QuestGenerator) {}

    // una corsa normale senza argomenti (D-16): stesso target e stesso tetto; audit automatico dell'interceptor
    @Roles(RoleType.innkeeper)
    @AuditTarget('QuestGeneration', () => null)
    @Mutation(() => GenerateQuestsResult)
    async generateQuests(): Promise<GenerateQuestsResult> {
        return { created: await this.generator.generate() };
    }
}
