import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { TravelKind } from 'src/models/character/active-travel.model';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import { idForms, refIdOf, sameId } from 'src/mongo/document-id';
import { travelSpeedFactorOf } from 'src/quests/outcomes/injuries/injury-rules';
import type { LonLat, RoadRoute } from 'src/roads/road-route';
import { RoadsService } from 'src/roads/roads.service';
import { classifyFreeTravel } from './travel-rules';
import {
    ActiveTravelDraft,
    BASE_SPEED,
    buildActiveTravel,
    speedOf,
} from './travel-timing';

export interface FreeTravelPlan {
    location: Types.ObjectId;
    travel: ActiveTravelDraft;
}

export interface AutoTravelRequest {
    questId: Types.ObjectId;
    characterId: Types.ObjectId;
    from: Types.ObjectId;
    to: Types.ObjectId;
    pet: unknown;
    injuries?: readonly unknown[] | null;
}

interface CharacterTravelSnapshot {
    status?: {
        location?: unknown;
        activeTravel?: unknown;
        awaitingAid?: unknown;
        injuries?: unknown[];
    };
    quests?: { pendingQuest?: unknown };
    assets?: { pet?: unknown };
}

interface PoiLocationSnapshot {
    location: LonLat;
}

interface PetSpeedSnapshot {
    speedModifier?: unknown;
}

// della polilinea del viaggio basta la presenza: endTime evita di leggere le coordinate
const CHARACTER_PROJECTION = {
    'status.location': 1,
    'status.activeTravel.endTime': 1,
    'quests.pendingQuest': 1,
    'assets.pet': 1,
    'status.awaitingAid': 1,
    'status.injuries': 1,
};

const POI_LOCATION_PROJECTION = { location: 1 };

@Injectable()
export class TravelPlanner {
    private readonly logger = new Logger(TravelPlanner.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        @InjectModel(City.name)
        private readonly cityModel: Model<CityDocument>,
        @InjectModel(Pet.name)
        private readonly petModel: Model<PetDocument>,
        private readonly roads: RoadsService,
        private readonly clock: Clock,
    ) {}

    // letture lean fuori dalla scrittura (D-21): nulla viene scritto, la scrittura e le guard riaffermate stanno nel chiamante
    async planFree(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
    ): Promise<FreeTravelPlan> {
        const character = await this.characterModel
            .findOne(activeCharacterById(characterId), CHARACTER_PROJECTION)
            .lean<CharacterTravelSnapshot>()
            .exec();
        if (!character) throw ResourceNotFoundException.character();
        const destination = await this.poiLocationOf(poiId);
        if (!destination) throw ResourceNotFoundException.pointOfInterest();
        // solo i marker di città sono mete del viaggio libero (D-01)
        const destinationIsCityMarker = !!(await this.cityModel
            .exists({ markerLocation: { $in: idForms(poiId) } })
            .exec());
        const location = refIdOf(character.status?.location);
        const sameLocation = !!location && sameId(location, poiId);
        const route =
            location && !sameLocation
                ? await this.routeFrom(location, destination)
                : null;
        const rejection = classifyFreeTravel({
            destinationIsCityMarker,
            awaitingAid: character.status?.awaitingAid != null,
            travelling: character.status?.activeTravel != null,
            onQuest: character.quests?.pendingQuest != null,
            sameLocation,
            hasRoute: route !== null,
        });
        if (rejection) throw rejection;
        const speed = await this.speedFor(
            character.assets?.pet,
            character.status?.injuries,
        );
        const travel = buildActiveTravel({
            route: route as RoadRoute,
            speed,
            now: this.clock.now(),
            to: poiId,
            kind: TravelKind.free,
        });
        return { location: location as Types.ObjectId, travel };
    }

    // viaggio automatico verso il marker della quest (D-02): null = nessuna strada ⇒ salto istantaneo (D-03);
    // marker senza documento POI = difetto di catalogo ⇒ rifiuto fail-closed (D-27), mai un salto su un luogo inesistente
    async planAuto(
        request: AutoTravelRequest,
    ): Promise<ActiveTravelDraft | null> {
        const [from, to] = await Promise.all([
            this.poiLocationOf(request.from),
            this.poiLocationOf(request.to),
        ]);
        if (!to) {
            this.logger.warn(
                `Marker ${request.to.toHexString()} della missione ${request.questId.toHexString()} inesistente: accettazione rifiutata`,
            );
            throw GameRuleException.questNotAcceptable();
        }
        // la partenza pendente è benigna: il salto ripara la posizione
        const route = from
            ? this.roads.routeBetween(from.location, to.location)
            : null;
        if (!route) {
            this.logger.warn(
                `Nessuna strada dal luogo ${request.from.toHexString()} al marker ${request.to.toHexString()} della missione ${request.questId.toHexString()} per il personaggio ${request.characterId.toHexString()}: salto istantaneo`,
            );
            return null;
        }
        return buildActiveTravel({
            route,
            speed: await this.speedFor(request.pet, request.injuries),
            now: this.clock.now(),
            to: request.to,
            kind: TravelKind.quest,
        });
    }

    private poiLocationOf(
        poiId: Types.ObjectId,
    ): Promise<PoiLocationSnapshot | null> {
        return this.poiModel
            .findById(poiId, POI_LOCATION_PROJECTION)
            .lean<PoiLocationSnapshot>()
            .exec();
    }

    private async routeFrom(
        location: Types.ObjectId,
        destination: PoiLocationSnapshot,
    ): Promise<RoadRoute | null> {
        const from = await this.poiLocationOf(location);
        return from
            ? this.roads.routeBetween(from.location, destination.location)
            : null;
    }

    // velocità fotografata alla partenza: pet × ferite (Phase 8 D-09, D-15)
    private async speedFor(
        pet: unknown,
        injuries: readonly unknown[] | null | undefined,
    ): Promise<number> {
        return (await this.petSpeedOf(pet)) * travelSpeedFactorOf(injuries);
    }

    // pet assente o non trovato ⇒ velocità base
    private async petSpeedOf(pet: unknown): Promise<number> {
        const petId = refIdOf(pet);
        if (!petId) return BASE_SPEED;
        const document = await this.petModel
            .findById(petId, { speedModifier: 1 })
            .lean<PetSpeedSnapshot>()
            .exec();
        if (!document) return BASE_SPEED;
        const { speed, invalid } = speedOf(document.speedModifier);
        if (invalid)
            this.logger.warn(
                `Pet ${petId.toHexString()} con speedModifier non valido: velocità base`,
            );
        return speed;
    }
}
