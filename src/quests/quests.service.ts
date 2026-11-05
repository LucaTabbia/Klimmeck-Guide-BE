import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms, objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import { QUEST_LANES } from './acceptance/quest-lanes';
import {
    BOARD_CHARACTER_PROJECTION,
    BoardCity,
    BoardScope,
    boardFilterOf,
    cityOfLocationFilter,
    cityPoiIdsOf,
    laneQuestIdsOf,
} from './quest-board';
import {
    dropOrphanCatalogRefs,
    QUEST_CATALOG_POPULATE,
} from './quest-catalog.populate';

interface BoardCharacter {
    status?: { location?: unknown; title?: unknown } | null;
    quests?: Partial<Record<(typeof QUEST_LANES)[number], unknown>> | null;
}

@Injectable()
export class QuestsService {
    constructor(
        @InjectModel(Quest.name) private questModel: Model<QuestDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        @InjectModel(Character.name)
        private characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(City.name) private cityModel: Model<CityDocument>,
    ) {}

    // tabellone per area (13.1 D-05): nessun personaggio corrente o archiviato ⇒ [];
    // una quest conclusa sparisce dalla board per tutti (D-06): legacy senza campo = null
    async findForViewer(userId: string): Promise<Quest[]> {
        const scope = await this.boardScopeOf(userId);
        if (scope === null) return [];
        const quests = await this.questModel
            .find(boardFilterOf(scope))
            .populate(QUEST_CATALOG_POPULATE)
            .exec();
        quests.forEach((quest) => dropOrphanCatalogRefs(quest));
        return quests;
    }

    // id malformato = missione inesistente: NOT_FOUND tipizzato invece dell'eccezione Nest grezza (INTERNAL_SERVER_ERROR sul filo)
    async findOne(id: string): Promise<Quest> {
        const questId = objectIdFromHex(id);
        if (!questId) throw ResourceNotFoundException.quest();
        const quest = await this.questModel
            .findOne({ _id: questId, concludedAt: null })
            .populate(QUEST_CATALOG_POPULATE)
            .exec();
        if (!quest) throw ResourceNotFoundException.quest();
        dropOrphanCatalogRefs(quest);
        return quest;
    }

    private async boardScopeOf(userId: string): Promise<BoardScope | null> {
        const characterId = await this.currentCharacterIdOf(userId);
        if (characterId === null) return null;
        const character = await this.boardCharacterOf(characterId);
        if (character === null) return null;
        return {
            poiIds: await this.cityPoiIdsAt(
                refIdOf(character.status?.location),
            ),
            title: character.status?.title,
            laneQuestIds: await this.laneQuestIdsOf(character),
        };
    }

    private async currentCharacterIdOf(
        userId: string,
    ): Promise<Types.ObjectId | null> {
        const id = objectIdFromHex(userId);
        if (id === null) return null;
        const user = await this.userModel
            .findById(id, { currentCharacter: 1 })
            .lean<{ currentCharacter?: unknown } | null>()
            .exec();
        return refIdOf(user?.currentCharacter);
    }

    // activeCharacterById: un archiviato o un morto non passa
    private boardCharacterOf(
        characterId: Types.ObjectId,
    ): Promise<BoardCharacter | null> {
        return this.characterModel
            .findOne(
                activeCharacterById(characterId),
                BOARD_CHARACTER_PROJECTION,
            )
            .lean<BoardCharacter | null>()
            .exec();
    }

    private async laneQuestIdsOf(
        character: BoardCharacter,
    ): Promise<Types.ObjectId[]> {
        const laneIds = QUEST_LANES.map((lane) =>
            refIdOf(character.quests?.[lane]),
        ).filter((id): id is Types.ObjectId => id !== null);
        if (laneIds.length === 0) return [];
        const pendingQuests = await this.pendingQuestModel
            .find({ _id: { $in: laneIds.flatMap(idForms) } }, { quest: 1 })
            .lean<{ quest?: unknown }[]>()
            .exec();
        return laneQuestIdsOf(pendingQuests);
    }

    // su strada (POI di nessuna città) o senza posizione: nessun POI di città;
    // driver nativo: il cast di Mongoose sul ref ObjectId trasformerebbe la forma stringa di idForms e perderebbe il marker legacy
    private async cityPoiIdsAt(
        location: Types.ObjectId | null,
    ): Promise<Types.ObjectId[]> {
        if (location === null) return [];
        const city = await this.cityModel.collection.findOne<BoardCity>(
            cityOfLocationFilter(location),
            { projection: { markerLocation: 1, pointsOfInterest: 1 } },
        );
        return city === null ? [] : cityPoiIdsOf(city);
    }
}
