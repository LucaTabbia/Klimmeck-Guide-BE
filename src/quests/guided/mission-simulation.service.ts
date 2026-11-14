// D-04: nessuna scrittura fuori dalla bozza, nessun tiro della sorgente condivisa
import { Injectable } from '@nestjs/common';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { objectIdFromHex } from 'src/mongo/document-id';
import { buildCombatContext } from 'src/quests/outcomes/combat/combat-context';
import {
    CombatResolver,
    type ParticipantEffects,
} from 'src/quests/outcomes/combat/combat-resolver';
import { GmRequestReader } from 'src/quests/outcomes/gm-request.reader';
import type { QuestEnemyRef } from 'src/quests/outcomes/quest-enemies';
import {
    ResolutionLoader,
    type ResolutionCharacter,
} from 'src/quests/outcomes/resolution-loader.service';
import { previousEffectsOf, resetFrom } from './draft-invalidation';
import { effectsRecordOf, fightStartOf, stateBeforeFight } from './fight-state';
import {
    MAX_ENEMY_QUANTITY,
    MAX_FIGHT_ENEMIES,
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

export const enemiesWithinCaps = (
    enemies: readonly MissionEnemyInput[],
): boolean =>
    enemies.length >= 1 &&
    enemies.length <= MAX_FIGHT_ENEMIES &&
    enemies.every(
        ({ quantity }) =>
            Number.isInteger(quantity) &&
            quantity >= 1 &&
            quantity <= MAX_ENEMY_QUANTITY,
    );

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
        const request = await this.requests.read(input.pendingQuestId);
        const draft = await this.drafts.requireFor(request);
        assertSimulable(draft.fights, input);
        const k = input.fightIndex;
        const entries = enemyRefsOf(input.enemies);
        const inDraft = new Set(
            draft.participants.map(({ character }) => character.toHexString()),
        );
        const overlaid = request.seats
            .map(({ character }) => character)
            .filter((character) => inDraft.has(character._id.toHexString()))
            .map((character) =>
                stateBeforeFight(
                    character,
                    previousEffectsOf(
                        draft.fights,
                        k,
                        character._id.toHexString(),
                    ),
                ),
            );
        const catalog = await this.loader.readCombatCatalog(
            entries,
            overlaid,
            `della bozza ${draft._id.toHexString()}`,
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
        const resolution = this.combat.resolve(context, this.simulationChance);
        const effectsOf = new Map(
            resolution.participants.map((effects) => [
                effects.characterId,
                effects,
            ]),
        );
        const fight: MissionFightRecord = {
            enemies: entries,
            verdict: MissionFightVerdict[resolution.verdict],
            outcomes: overlaid.map((state) =>
                outcomeOf(state, effectsOf.get(state._id.toHexString())),
            ),
        };
        const fights = [...draft.fights];
        fights[k] = fight;
        return this.drafts.write(draft._id, {
            fights: resetFrom(fights, k + 1),
        });
    }
}
