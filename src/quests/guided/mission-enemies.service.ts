import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ENEMY_WIRE_POPULATE } from 'src/enemies/enemies.service';
import { withoutOrphanRelatedLore } from 'src/lore/related-lore';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import { refIdOf } from 'src/mongo/document-id';
import { slotsOf } from 'src/quests/acceptance/quest-capacity';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import {
    GmRequest,
    GmRequestReader,
} from 'src/quests/outcomes/gm-request.reader';
import {
    byMissionOrder,
    MissionEnemyCandidate,
    missionBandOf,
    missionEnemyPoolOf,
} from './mission-enemy-pool';
import { MissionDraftService } from './mission-draft.service';

interface BestiaryEntry {
    candidate: MissionEnemyCandidate;
    enemy: Enemy;
}

function entryOf(document: EnemyDocument): BestiaryEntry {
    const enemy = withoutOrphanRelatedLore(document) as Enemy;
    return {
        candidate: {
            id: String(document._id),
            name: enemy.name ?? '',
            xp: enemy.xp ?? 0,
            locations: enemy.locations ?? [],
            legendary: enemy.legendary,
        },
        enemy,
    };
}

function seatTitlesOf(request: GmRequest) {
    const slots = slotsOf(request.quest.requirements?.requiredAdventurers);
    return slots === 'invalid' ? [] : slots.map(({ title }) => title);
}

// la lista dell'oste (D-03, D-19): luogo della bozza o del primo partecipante, fascia della missione; showAll = bestiario intero
@Injectable()
export class MissionEnemiesService {
    constructor(
        private readonly requests: GmRequestReader,
        private readonly drafts: MissionDraftService,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
    ) {}

    async list(pendingQuestHex: string, showAll: boolean): Promise<Enemy[]> {
        const request = await this.requests.read(pendingQuestHex);
        const bestiary = await this.bestiary();
        const byId = new Map(
            bestiary.map((entry) => [entry.candidate.id, entry.enemy]),
        );
        const candidates = bestiary.map(({ candidate }) => candidate);
        const chosen = showAll
            ? [...candidates].sort(byMissionOrder)
            : missionEnemyPoolOf(candidates, {
                  poiTypes: await this.poiTypesOf(
                      await this.placeOf(pendingQuestHex, request),
                  ),
                  band: missionBandOf(
                      request.quest.requirements?.minTitle,
                      seatTitlesOf(request),
                  ),
                  legendaries: request.lane === QuestLane.worldMission,
              });
        return chosen.map(({ id }) => byId.get(id)!);
    }

    private async bestiary(): Promise<BestiaryEntry[]> {
        const documents = await this.enemyModel
            .find({})
            .populate(ENEMY_WIRE_POPULATE)
            .exec();
        return documents.map(entryOf);
    }

    // D-01: il luogo scritto dopo il teleport, altrimenti dove sta il primo partecipante
    private async placeOf(
        pendingQuestHex: string,
        request: GmRequest,
    ): Promise<Types.ObjectId | null> {
        const draft = await this.drafts.read(pendingQuestHex);
        return (
            draft?.place ?? refIdOf(request.seats[0]?.character.status.location)
        );
    }

    private async poiTypesOf(
        place: Types.ObjectId | null,
    ): Promise<readonly string[]> {
        if (!place) return [];
        const poi = await this.poiModel
            .findById(place, { type: 1 })
            .lean<Pick<PointOfInterest, 'type'> | null>()
            .exec();
        return poi?.type ?? [];
    }
}
