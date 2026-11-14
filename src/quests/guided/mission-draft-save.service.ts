// D-18: sezioni presenti sostituiscono; D-24 e D-14 sullo stato all'inizio di ogni scontro
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import {
    overrideParticipantOf,
    validateOverrides,
} from 'src/quests/outcomes/gm-overrides';
import {
    type GmRequest,
    GmRequestReader,
} from 'src/quests/outcomes/gm-request.reader';
import type { ResolutionCharacter } from 'src/quests/outcomes/resolution-loader.service';
import {
    previousEffectsOf,
    reconcileFights,
    resetFrom,
} from './draft-invalidation';
import {
    assertAddsOnlyNewInjuries,
    effectsRecordOf,
    participantEffectsOf,
    stateBeforeFight,
} from './fight-state';
import {
    MAX_MISSION_FIGHTS,
    type MissionFightInput,
    type SaveMissionDraftInput,
} from './mission-draft.inputs';
import type {
    MissionDraftRecord,
    MissionFightEffectsRecord,
    MissionFightEnemyRecord,
    MissionFightRecord,
} from './mission-draft.model';
import {
    type MissionDraftSections,
    MissionDraftService,
} from './mission-draft.service';
import { enemiesWithinCaps } from './mission-simulation.service';

const hexOf = (id: Types.ObjectId): string => id.toHexString();

// difesa in profondità dei tetti dell'input (D-31)
function assertFightsWithinCaps(fights: readonly MissionFightInput[]): void {
    const withinCaps =
        fights.length <= MAX_MISSION_FIGHTS &&
        fights.every(({ enemies }) => enemiesWithinCaps(enemies));
    if (!withinCaps) throw GameRuleException.outcomeOverrideInvalid();
}

function enemyRecordsOf(
    fights: readonly MissionFightInput[],
): MissionFightEnemyRecord[][] {
    return fights.map(({ enemies }) =>
        enemies.map(({ enemy, quantity }) => {
            const id = objectIdFromHex(enemy);
            if (!id) throw ResourceNotFoundException.enemy();
            return { enemy: id, quantity };
        }),
    );
}

const effectsKeyOf = (record: MissionFightEffectsRecord | null): string =>
    JSON.stringify(record && participantEffectsOf('', record));

const sameCorrections = (
    fight: MissionFightRecord,
    corrected: readonly (MissionFightEffectsRecord | null)[],
): boolean =>
    fight.outcomes.every(
        (outcome, index) =>
            effectsKeyOf(outcome.corrected) === effectsKeyOf(corrected[index]),
    );

@Injectable()
export class MissionDraftSaveService {
    constructor(
        private readonly requests: GmRequestReader,
        private readonly drafts: MissionDraftService,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
    ) {}

    async save(input: SaveMissionDraftInput): Promise<MissionDraftRecord> {
        const request = await this.requests.read(input.pendingQuestId);
        const draft = await this.drafts.requireFor(request);
        const set: MissionDraftSections = {};
        if (input.step != null) set.step = input.step;
        if (input.place != null) set.place = await this.placeOf(input.place);
        if (input.fights != null)
            set.fights = await this.fightsOf(request, draft, input.fights);
        return this.drafts.write(draft._id, set);
    }

    private async placeOf(placeHex: string): Promise<Types.ObjectId> {
        const place = objectIdFromHex(placeHex);
        if (!place || !(await this.poiModel.exists({ _id: place }).exec()))
            throw ResourceNotFoundException.pointOfInterest();
        return place;
    }

    private async fightsOf(
        request: GmRequest,
        draft: MissionDraftRecord,
        incoming: readonly MissionFightInput[],
    ): Promise<MissionFightRecord[]> {
        assertFightsWithinCaps(incoming);
        const enemies = enemyRecordsOf(incoming);
        await this.assertEnemiesExist(enemies);
        let fights = reconcileFights(draft.fights, enemies);
        const characters = this.draftCharactersOf(request, draft);
        incoming.forEach(({ corrections }, index) => {
            if (corrections == null) return;
            fights = this.corrected(fights, index, corrections, characters);
        });
        return fights;
    }

    private async assertEnemiesExist(
        fights: readonly MissionFightEnemyRecord[][],
    ): Promise<void> {
        const ids = [
            ...new Set(fights.flat().map(({ enemy }) => hexOf(enemy))),
        ].map((hex) => new Types.ObjectId(hex));
        if (ids.length === 0) return;
        const found = await this.enemyModel
            .countDocuments({ _id: { $in: ids } })
            .exec();
        if (found !== ids.length) throw ResourceNotFoundException.enemy();
    }

    private draftCharactersOf(
        request: GmRequest,
        draft: MissionDraftRecord,
    ): ResolutionCharacter[] {
        const inDraft = new Set(
            draft.participants.map(({ character }) => hexOf(character)),
        );
        return request.seats
            .map(({ character }) => character)
            .filter((character) => inDraft.has(hexOf(character._id)));
    }

    // effetto completo sullo stato all'inizio dello scontro; i non elencati tornano al simulato (D-06)
    private corrected(
        fights: MissionFightRecord[],
        index: number,
        corrections: readonly ParticipantOverrideInput[],
        characters: readonly ResolutionCharacter[],
    ): MissionFightRecord[] {
        const fight = fights[index];
        if (fight.verdict == null)
            throw GameRuleException.outcomeOverrideInvalid();
        const overlays = characters.map((character) =>
            stateBeforeFight(
                character,
                previousEffectsOf(fights, index, hexOf(character._id)),
            ),
        );
        const effects = validateOverrides(
            corrections,
            overlays.map(overrideParticipantOf),
        );
        const corrected = fight.outcomes.map((outcome) => {
            const entry = effects.get(hexOf(outcome.character)) ?? null;
            if (!entry) return null;
            assertAddsOnlyNewInjuries(
                outcome.injuriesBefore,
                entry.injuriesAdded,
            );
            return effectsRecordOf(entry);
        });
        if (sameCorrections(fight, corrected)) return fights;
        const updated = [...fights];
        updated[index] = {
            ...fight,
            outcomes: fight.outcomes.map((outcome, position) => ({
                ...outcome,
                corrected: corrected[position],
            })),
        };
        return resetFrom(updated, index + 1);
    }
}
