import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { Character } from 'src/models/character/character.model';
import {
    enemyFactsOf,
    enemyXpByIdOf,
} from 'src/quests/outcomes/combatant-plan';
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
import type { CompanionCatalogEntry } from 'src/quests/outcomes/pets/companion-after-fight';
import {
    type ResolutionCharacter,
    ResolutionLoader,
} from 'src/quests/outcomes/resolution-loader.service';
import type {
    RewardCatalog,
    RewardRefs,
} from 'src/quests/outcomes/rewards/quest-rewards';
import { victoryKnowledgeOf } from 'src/quests/outcomes/victory-knowledge';
import { additionFor } from './background-additions';
import { chosenRewardsOf } from './chosen-rewards';
import {
    assertWoundCorrectionAllowed,
    fightStartOf,
    stateBeforeFight,
} from './fight-state';
import {
    aggregateEffectsOf,
    assertFightsComplete,
    type EffectiveFight,
    effectiveSequenceOf,
    guidedBattleOf,
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

// D-07, D-14: ogni scontro rivalidato sullo stato lasciato dai precedenti; le rimozioni solo sugli effetti corretti (ruling W5); una ferita già portata riproposta è ignorata dalla piega (Phase 25 D-19)
function assertSequenceAllowed(
    snapshot: ResolutionCharacter,
    sequence: readonly EffectiveFight[],
    petCatalog: ReadonlyMap<string, CompanionCatalogEntry>,
): void {
    const characterHex = hexOf(snapshot._id);
    sequence.forEach(({ effects, corrected }, index) => {
        const overlay = stateBeforeFight(
            snapshot,
            sequence.slice(0, index).map((fight) => fight.effects),
            petCatalog,
        );
        validateOverrides(
            [overrideInputOf(characterHex, effects)],
            [overrideParticipantOf(overlay, petCatalog)],
        );
        if (corrected)
            assertWoundCorrectionAllowed(
                fightStartOf(overlay, petCatalog).injuriesBefore,
                effects,
            );
    });
}

interface GuidedCatalogs {
    seatBase: Pick<GmSeatOutcome, 'enemies' | 'victory'>;
    enemyXp: ReadonlyMap<string, number>;
    petCatalog: ReadonlyMap<string, CompanionCatalogEntry>;
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
        @InjectModel(Character.name)
        private readonly characterModel: Model<Character>,
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
            enemyXp: enemyXpByIdOf(combat),
            petCatalog: combat.pets,
            prizeCatalogue: await this.prizeOptions.readCatalogue(),
            rewardCatalog: await this.loader.readRewardCatalogFor(
                rewardRefsOfPrizes(draft.prizes),
                null,
            ),
        };
        return this.completion.completeWith({
            request,
            recoveryTimes: await this.loader.recoveryTimesOf(
                this.spellsUsedBy(draft, characters),
            ),
            petMaxXp: combat.petMaxXp,
            petCatalog: combat.pets,
            now: this.clock.now(),
            outcomesOf: (snapshots) =>
                this.outcomesOf(request, draft, catalogs, snapshots),
            afterSeats: async (session) => {
                await this.appendBackgroundAdditions(
                    draft,
                    characters,
                    session,
                );
                await this.deleteReadRevision(draft, session);
            },
        });
    }

    // D-05, D-08: una voce in coda per ogni posto con un'aggiunta, nella transazione del completamento; le voci di prima non si leggono né si riscrivono
    private async appendBackgroundAdditions(
        draft: MissionDraftRecord,
        characters: readonly ResolutionCharacter[],
        session: ClientSession,
    ): Promise<void> {
        for (const { _id } of characters) {
            const addition = additionFor(draft.backgroundAdditions, _id);
            if (addition === null) continue;
            const { matchedCount } = await this.characterModel
                .updateOne(
                    { _id },
                    { $push: { 'infos.background': addition } },
                    { session },
                )
                .exec();
            if (matchedCount !== 1)
                throw GameRuleException.outcomeOverrideInvalid();
        }
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
            catalogs.petCatalog,
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
            battle: guidedBattleOf(
                draft.fights,
                characterHex,
                catalogs.enemyXp,
                snapshot.status,
            ),
            rewards: chosenRewardsOf(prize, catalogs.rewardCatalog),
            // D-09: la stessa lettura rivalidata che decide la scrittura in afterSeats
            backgroundEntryAdded:
                additionFor(draft.backgroundAdditions, snapshot._id) !== null,
        };
    }

    private spellsUsedBy(
        draft: MissionDraftRecord,
        characters: readonly ResolutionCharacter[],
    ): Types.ObjectId[] {
        return uniqueIds(
            characters.flatMap(
                ({ _id, status }) =>
                    aggregateEffectsOf(
                        draft.fights,
                        hexOf(_id),
                        status,
                    )?.spellsUsed.map(
                        ({ spellId }) => new Types.ObjectId(spellId),
                    ) ?? [],
            ),
        );
    }
}
