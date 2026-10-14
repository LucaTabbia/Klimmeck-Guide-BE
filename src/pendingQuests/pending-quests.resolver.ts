import { Args, Query, Resolver } from '@nestjs/graphql';
import { OwnsPendingQuest } from 'src/authz/ownership/ownership.decorators';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';
import { PendingQuest } from 'src/models/pending-quest.model';
import { PendingQuestsService } from './pending-quests.service';

@Resolver(() => PendingQuest)
export class PendingQuestsResolver {
    constructor(private pendingQuestsService: PendingQuestsService) {}

    @Roles(RoleType.innkeeper)
    @Query(() => [PendingQuest])
    async pendingQuests(): Promise<PendingQuest[]> {
        return this.pendingQuestsService.findAll();
    }

    @OwnsPendingQuest<{ id: string }>(({ id }) => id)
    @Query(() => PendingQuest)
    async pendingQuest(@Args('id') id: string): Promise<PendingQuest> {
        return this.pendingQuestsService.findOne(id);
    }
}
