import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AuditTarget } from 'src/authz/audit/audit-target.decorator';
import { Roles } from 'src/authz/roles/roles.decorator';
import { CommonResponse } from 'src/models/common/common-response.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { MissionDraftPresenter } from './mission-draft.mapper';
import { MissionDraftService } from './mission-draft.service';
import { MissionDraftView } from './mission-draft.wire';

const pendingQuestTarget = ({ pendingQuestId }: Record<string, unknown>) =>
    pendingQuestId;

// la bozza è solo dell'oste (D-10): ogni handler è @Roles(innkeeper); le mutation entrano nel log di audit, la lettura no (D-26)
@Resolver()
export class GuidedMissionResolver {
    constructor(
        private readonly drafts: MissionDraftService,
        private readonly presenter: MissionDraftPresenter,
    ) {}

    @Roles(RoleType.innkeeper)
    @AuditTarget('PendingQuest', pendingQuestTarget)
    @Mutation(() => MissionDraftView)
    async startMissionDraft(
        @Args('pendingQuestId', { type: () => ID }) pendingQuestId: string,
        @CurrentUser() identity: AuthIdentity | undefined,
    ): Promise<MissionDraftView> {
        const draft = await this.drafts.start(
            pendingQuestId,
            identity?.userId ?? null,
        );
        return this.presenter.present(draft);
    }

    @Roles(RoleType.innkeeper)
    @Query(() => MissionDraftView, { nullable: true })
    async missionDraft(
        @Args('pendingQuestId', { type: () => ID }) pendingQuestId: string,
    ): Promise<MissionDraftView | null> {
        const draft = await this.drafts.read(pendingQuestId);
        return draft ? this.presenter.present(draft) : null;
    }

    @Roles(RoleType.innkeeper)
    @AuditTarget('PendingQuest', pendingQuestTarget)
    @Mutation(() => CommonResponse)
    async discardMissionDraft(
        @Args('pendingQuestId', { type: () => ID }) pendingQuestId: string,
    ): Promise<CommonResponse> {
        await this.drafts.discard(pendingQuestId);
        return { response: 'Bozza scartata', successful: true };
    }
}
