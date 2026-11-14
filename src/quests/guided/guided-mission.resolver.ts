import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AuditTarget } from 'src/authz/audit/audit-target.decorator';
import { Roles } from 'src/authz/roles/roles.decorator';
import { CommonResponse } from 'src/models/common/common-response.model';
import { Enemy } from 'src/models/enemy.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { SimulateMissionFightInput } from './mission-draft.inputs';
import { MissionDraftPresenter } from './mission-draft.mapper';
import { MissionDraftService } from './mission-draft.service';
import {
    MissionDraftView,
    MissionPrizeOptionsView,
} from './mission-draft.wire';
import { MissionEnemiesService } from './mission-enemies.service';
import { MissionPrizeOptionsService } from './mission-prize-options.service';
import { MissionSimulationService } from './mission-simulation.service';

const pendingQuestTarget = ({ pendingQuestId }: Record<string, unknown>) =>
    pendingQuestId;

const inputPendingQuestTarget = ({ input }: Record<string, unknown>) =>
    (input as { pendingQuestId?: unknown } | undefined)?.pendingQuestId;

// la bozza è solo dell'oste (D-10): ogni handler è @Roles(innkeeper); le mutation entrano nel log di audit, la lettura no (D-26)
@Resolver()
export class GuidedMissionResolver {
    constructor(
        private readonly drafts: MissionDraftService,
        private readonly presenter: MissionDraftPresenter,
        private readonly enemies: MissionEnemiesService,
        private readonly simulation: MissionSimulationService,
        private readonly prizeOptions: MissionPrizeOptionsService,
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
    @Query(() => [Enemy])
    missionEnemies(
        @Args('pendingQuestId', { type: () => ID }) pendingQuestId: string,
        @Args('showAll', {
            type: () => Boolean,
            nullable: true,
            defaultValue: false,
        })
        showAll: boolean,
    ): Promise<Enemy[]> {
        return this.enemies.list(pendingQuestId, showAll);
    }

    @Roles(RoleType.innkeeper)
    @Query(() => MissionPrizeOptionsView)
    missionPrizeOptions(
        @Args('characterId', { type: () => ID }) characterId: string,
        @Args('pendingQuestId', { type: () => ID }) pendingQuestId: string,
    ): Promise<MissionPrizeOptionsView> {
        return this.prizeOptions.optionsFor(pendingQuestId, characterId);
    }

    @Roles(RoleType.innkeeper)
    @AuditTarget('PendingQuest', inputPendingQuestTarget)
    @Mutation(() => MissionDraftView)
    async simulateMissionFight(
        @Args('input', { type: () => SimulateMissionFightInput })
        input: SimulateMissionFightInput,
    ): Promise<MissionDraftView> {
        return this.presenter.present(await this.simulation.simulate(input));
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
