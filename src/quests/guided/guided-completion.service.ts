import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { enemyFactsOf } from 'src/quests/outcomes/combatant-plan';
import {
    GmCompletionService,
    type GmSeatOutcome,
} from 'src/quests/outcomes/gm-completion.service';
import {
    overrideParticipantOf,
    validateOverrides,
} from 'src/quests/outcomes/gm-overrides';
import {
    assertNoBusyParticipant,
    type GmRequest,
    GmRequestReader,
} from 'src/quests/outcomes/gm-request.reader';
import type { QuestResultDraft } from 'src/quests/outcomes/outcome-plan';
import {
    type ResolutionCharacter,
    ResolutionLoader,
} from 'src/quests/outcomes/resolution-loader.service';
import type {
    RewardCatalog,
    RewardRefs,
} from 'src/quests/outcomes/rewards/quest-rewards';
import { victoryKnowledgeOf } from 'src/quests/outcomes/victory-knowledge';
import { chosenRewardsOf } from './chosen-rewards';
import {
    assertAddsOnlyNewInjuries,
    fightStartOf,
    stateBeforeFight,
} from './fight-state';
import {
    aggregateEffectsOf,
    assertFightsComplete,
    type EffectiveFight,
    effectiveSequenceOf,
    mergedEnemiesOf,
    overrideInputOf,
} from './guided-outcome';
import { hexOf, presentIds, uniqueIds } from './ids';
import {
    MissionDraft,
    type MissionDraftRecord,
    type MissionPrizeRecord,
} from './mission-draft.model';
import { MissionDraftService } from './mission-draft.service';
import { MissionPrizeOptionsService } from './mission-prize-options.service';
import {
    assertPrizeAllowed,
    type ChosenPrizeRefs,
    type MissionPrizeCatalogue,
} from './mission-prizes';

function rewardRefsOfPrizes(prizes: readonly MissionPrizeRecord[]): RewardRefs {
    return {
        items: prizes.flatMap(({ items }) =>
            items.map(({ itemType, item }) => ({ itemType, item })),
        ),
        spellIds: presentIds(prizes.map(({ spell }) => spell)),
        petIds: presentIds(prizes.map(({ pet }) => pet)),
    };
}

const chosenRefsOf = (prize: MissionPrizeRecord): ChosenPrizeRefs => ({
    items: prize.items.map(({ itemType, item }) => ({
        itemType,
        item: hexOf(item),
    })),
    pet: prize.pet && hexOf(prize.pet),
    spell: prize.spell && hexOf(prize.spell),
});

// D-07, D-14: ogni scontro rivalidato sullo stato lasciato dai precedenti; le ferite di prima solo sugli effetti corretti (ruling W5)
function assertSequenceAllowed(
    snapshot: ResolutionCharacter,
    sequence: readonly EffectiveFight[],
): void {
    const characterHex = hexOf(snapshot._id);
    sequence.forEach(({ effects, corrected }, index) => {
        const overlay = stateBeforeFight(
            snapshot,
            sequence.slice(0, index).map((fight) => fight.effects),
        );
        validateOverrides(
            [overrideInputOf(characterHex, effects)],
            [overrideParticipantOf(overlay)],
        );
        if (corrected)
            assertAddsOnlyNewInjuries(
                fightStartOf(overlay).injuriesBefore,
                effects.injuriesAdded,
            );
    });
}

interface GuidedCatalogs {
    seatBase: Pick<GmSeatOutcome, 'enemies' | 'victory'>;
    prizeCatalogue: MissionPrizeCatalogue;
    rewardCatalog: RewardCatalog;
}

// D-08: stesso ciclo e stessa consegna del completamento di oggi; nessun tiro; D-25: la bozza muore nella transazione
@Injectable()
export class GuidedCompletionService {
    constructor(
        private readonly requests: GmRequestReader,
        private readonly completion: GmCompletionService,
        private readonly drafts: MissionDraftService,
        private readonly prizeOptions: MissionPrizeOptionsService,
        private readonly loader: ResolutionLoader,
        @InjectModel(MissionDraft.name)
        private readonly draftModel: Model<MissionDraft>,
        private readonly clock: Clock,
    ) {}

    async complete(pendingQuestHex: string): Promise<QuestResultDraft[]> {
        const request = await this.requests.read(pendingQuestHex);
        const characters = request.seats.map(({ character }) => character);
        assertNoBusyParticipant(characters);
        const draft = await this.drafts.requireFor(request);
        const characterHexes = characters.map(({ _id }) => hexOf(_id));
        assertFightsComplete(draft.fights, characterHexes);
        const combat = await this.loader.readCombatCatalog(
            mergedEnemiesOf(draft.fights),
            characters,
            `della bozza ${hexOf(draft._id)}`,
        );
        const catalogs: GuidedCatalogs = {
            seatBase: {
                enemies: enemyFactsOf(combat),
                victory: victoryKnowledgeOf(combat),
            },
            prizeCatalogue: await this.prizeOptions.readCatalogue(),
            rewardCatalog: await this.loader.readRewardCatalogFor(
                rewardRefsOfPrizes(draft.prizes),
                null,
            ),
        };
        return this.completion.completeWith({
            request,
            recoveryTimes: await this.loader.recoveryTimesOf(
                this.spellsUsedBy(draft, characterHexes),
            ),
            petMaxXp: combat.petMaxXp,
            now: this.clock.now(),
            outcomesOf: (snapshots) =>
                this.outcomesOf(request, draft, catalogs, snapshots),
            afterSeats: (session) => this.deleteReadRevision(draft, session),
        });
    }

    // B-01: un salvataggio o una simulazione arrivati dopo la lettura cambiano la revisione e annullano la transazione
    private async deleteReadRevision(
        draft: MissionDraftRecord,
        session: ClientSession,
    ): Promise<void> {
        const { deletedCount } = await this.draftModel
            .deleteOne(
                // una bozza scritta prima del contatore non ha revisione: il filtro a null la trova solo se nessuno l'ha più scritta
                { _id: draft._id, rev: draft.rev ?? null },
                { session },
            )
            .exec();
        if (deletedCount === 0)
            throw GameRuleException.outcomeOverrideInvalid();
    }

    // un posto senza voce nella bozza resta senza esito: il ciclo condiviso rifiuta l'intera richiesta
    private outcomesOf(
        request: GmRequest,
        draft: MissionDraftRecord,
        catalogs: GuidedCatalogs,
        snapshots: readonly ResolutionCharacter[],
    ): Map<string, GmSeatOutcome> {
        const inDraft = new Set(
            draft.participants.map(({ character }) => hexOf(character)),
        );
        return new Map(
            snapshots
                .filter(({ _id }) => inDraft.has(hexOf(_id)))
                .map((snapshot) => [
                    hexOf(snapshot._id),
                    this.seatOutcomeOf(request, draft, catalogs, snapshot),
                ]),
        );
    }

    private seatOutcomeOf(
        request: GmRequest,
        draft: MissionDraftRecord,
        catalogs: GuidedCatalogs,
        snapshot: ResolutionCharacter,
    ): GmSeatOutcome {
        const characterHex = hexOf(snapshot._id);
        assertSequenceAllowed(
            snapshot,
            effectiveSequenceOf(draft.fights, characterHex),
        );
        const prize =
            draft.prizes.find(({ character }) =>
                character.equals(snapshot._id),
            ) ?? null;
        if (prize)
            assertPrizeAllowed(
                chosenRefsOf(prize),
                this.prizeOptions.allowanceFor(
                    request,
                    snapshot,
                    catalogs.prizeCatalogue,
                ),
            );
        return {
            ...catalogs.seatBase,
            battle: aggregateEffectsOf(draft.fights, characterHex),
            rewards: chosenRewardsOf(prize, catalogs.rewardCatalog),
        };
    }

    private spellsUsedBy(
        draft: MissionDraftRecord,
        characterHexes: readonly string[],
    ): Types.ObjectId[] {
        return uniqueIds(
            characterHexes.flatMap(
                (hex) =>
                    aggregateEffectsOf(draft.fights, hex)?.spellsUsed.map(
                        ({ spellId }) => new Types.ObjectId(spellId),
                    ) ?? [],
            ),
        );
    }
}
