// D-04: nessuna scrittura fuori dalla bozza, nessun tiro della sorgente condivisa
import { Injectable } from '@nestjs/common';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { objectIdFromHex } from 'src/mongo/document-id';
import { buildCombatContext } from 'src/quests/outcomes/combat/combat-context';
import {
    type CombatResolution,
    CombatResolver,
    type ParticipantEffects,
} from 'src/quests/outcomes/combat/combat-resolver';
import {
    type GmRequest,
    GmRequestReader,
} from 'src/quests/outcomes/gm-request.reader';
import type { QuestEnemyRef } from 'src/quests/outcomes/quest-enemies';
import {
    ResolutionLoader,
    type ResolutionCharacter,
} from 'src/quests/outcomes/resolution-loader.service';
import { previousEffectsOf, resetFrom } from './draft-invalidation';
import { effectsRecordOf, fightStartOf, stateBeforeFight } from './fight-state';
import { hexOf } from './ids';
import {
    enemiesWithinCaps,
    MAX_MISSION_FIGHTS,
    type MissionEnemyInput,
    type SimulateMissionFightInput,
} from './mission-draft.inputs';
import {
    type MissionDraftRecord,
    type MissionFightOutcomeRecord,
    type MissionFightRecord,
    MissionFightVerdict,
} from './mission-draft.model';
import { MissionDraftService } from './mission-draft.service';
import { MissionSimulationChance } from './mission-simulation.chance';

// D-24: k solo in coda o dentro la lista, e solo dopo un k-1 simulato
function assertSimulable(
    fights: readonly MissionFightRecord[],
    input: SimulateMissionFightInput,
): void {
    const k = input.fightIndex;
    const inRange =
        Number.isInteger(k) &&
        k >= 0 &&
        k <= fights.length &&
        k < MAX_MISSION_FIGHTS;
    if (!inRange || (k > 0 && fights[k - 1].verdict == null))
        throw GameRuleException.outcomeOverrideInvalid();
    if (!enemiesWithinCaps(input.enemies))
        throw GameRuleException.outcomeOverrideInvalid();
}

function enemyRefsOf(enemies: readonly MissionEnemyInput[]): QuestEnemyRef[] {
    return enemies.map(({ enemy, quantity }) => {
        const id = objectIdFromHex(enemy);
        if (!id) throw ResourceNotFoundException.enemy();
        return { enemy: id, quantity };
    });
}

function outcomeOf(
    state: ResolutionCharacter,
    effects: ParticipantEffects | undefined,
): MissionFightOutcomeRecord {
    return {
        character: state._id,
        ...fightStartOf(state),
        simulated: effects ? effectsRecordOf(effects) : null,
        corrected: null,
    };
}

// D-02: i partecipanti della bozza nello stato lasciato dagli scontri prima di k
function overlaidParticipants(
    request: GmRequest,
    draft: MissionDraftRecord,
    fightIndex: number,
): ResolutionCharacter[] {
    const inDraft = new Set(
        draft.participants.map(({ character }) => hexOf(character)),
    );
    return request.seats
        .map(({ character }) => character)
        .filter((character) => inDraft.has(hexOf(character._id)))
        .map((character) =>
            stateBeforeFight(
                character,
                previousEffectsOf(
                    draft.fights,
                    fightIndex,
                    hexOf(character._id),
                ),
            ),
        );
}

function fightRecordOf(
    resolution: CombatResolution,
    entries: QuestEnemyRef[],
    overlaid: readonly ResolutionCharacter[],
): MissionFightRecord {
    const effectsOf = new Map(
        resolution.participants.map((effects) => [
            effects.characterId,
            effects,
        ]),
    );
    return {
        enemies: entries,
        verdict: MissionFightVerdict[resolution.verdict],
        outcomes: overlaid.map((state) =>
            outcomeOf(state, effectsOf.get(hexOf(state._id))),
        ),
    };
}

@Injectable()
export class MissionSimulationService {
    constructor(
        private readonly requests: GmRequestReader,
        private readonly drafts: MissionDraftService,
        private readonly loader: ResolutionLoader,
        private readonly combat: CombatResolver,
        private readonly simulationChance: MissionSimulationChance,
    ) {}

    async simulate(
        input: SimulateMissionFightInput,
    ): Promise<MissionDraftRecord> {
        const { request, draft } = await this.readDraft(input.pendingQuestId);
        assertSimulable(draft.fights, input);
        const entries = enemyRefsOf(input.enemies);
        const overlaid = overlaidParticipants(request, draft, input.fightIndex);
        const fight = await this.resolveFight(
            request,
            draft,
            entries,
            overlaid,
        );
        return this.writeFight(draft, input.fightIndex, fight);
    }

    private async readDraft(
        pendingQuestHex: string,
    ): Promise<{ request: GmRequest; draft: MissionDraftRecord }> {
        const request = await this.requests.read(pendingQuestHex);
        return { request, draft: await this.drafts.requireFor(request) };
    }

    private async resolveFight(
        request: GmRequest,
        draft: MissionDraftRecord,
        entries: QuestEnemyRef[],
        overlaid: ResolutionCharacter[],
    ): Promise<MissionFightRecord> {
        const catalog = await this.loader.readCombatCatalog(
            entries,
            overlaid,
            `della bozza ${hexOf(draft._id)}`,
        );
        if (catalog.enemies.length !== entries.length)
            throw ResourceNotFoundException.enemy();
        const context = buildCombatContext({
            quest: request.quest,
            enemies: catalog.enemies,
            participants: overlaid,
            equipment: catalog.equipment,
            spells: catalog.spells,
            loot: catalog.loot,
            pets: catalog.pets,
        });
        return fightRecordOf(
            this.combat.resolve(context, this.simulationChance),
            entries,
            overlaid,
        );
    }

    // D-24: il rilancio di k annulla le simulazioni successive
    private writeFight(
        draft: MissionDraftRecord,
        fightIndex: number,
        fight: MissionFightRecord,
    ): Promise<MissionDraftRecord> {
        const fights = [...draft.fights];
        fights[fightIndex] = fight;
        return this.drafts.write(draft._id, {
            fights: resetFrom(fights, fightIndex + 1),
        });
    }
}
