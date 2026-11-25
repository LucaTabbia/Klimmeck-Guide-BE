import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model, Types } from 'mongoose';
import {
    activeRegistrantFilterOf,
    startedQuestResetOf,
} from 'src/characters/deletion/seat-release';
import type { InventoryEntry } from 'src/economy/trade/trade-inventory';
import { WalletService } from 'src/economy/wallet.service';
import { knowledgeAdditionOf } from 'src/lore/knowledge-addition';
import { LoreGeographyReader } from 'src/lore/lore-geography.reader';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import type { TitleType } from 'src/models/enums/title-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { statusFactsOf } from 'src/quests/outcomes/progression/status-facts';
import { registeredIdsOf } from './party-rules';
import {
    homeCityFilterOf,
    refundedLifeOf,
    startedQuestsWithFilter,
    travelRefundOf,
} from './started-quest-cancel';

// compagni rientrati, per il push e il registro
export interface CancelledStartedQuest {
    questId: Types.ObjectId;
    characterIds: Types.ObjectId[];
}

interface StartedQuestSnapshot {
    infos?: { markerLocation?: unknown } | null;
    registeredAdventurers?: { character?: unknown }[];
}

interface Home {
    location: Types.ObjectId | null;
    geography: Types.ObjectId[];
}

interface CompanionSnapshot {
    _id: Types.ObjectId;
    status: {
        xp?: number;
        level?: number;
        title: TitleType;
        currentLifePoints?: number;
        maxLifePoints?: number;
        activeTravel?: unknown;
    };
    quests?: { pendingQuest?: unknown } | null;
    assets?: { ownedItems?: InventoryEntry[] } | null;
}

interface TripSpending {
    pointsSpent?: unknown;
    travelFoodSpent?: { item: unknown; quantity: unknown }[];
    travelHungerLifeLost?: number;
}

const COMPANION_PROJECTION = {
    'status.xp': 1,
    'status.level': 1,
    'status.title': 1,
    'status.currentLifePoints': 1,
    'status.maxLifePoints': 1,
    'status.activeTravel': 1,
    'quests.pendingQuest': 1,
    'assets.ownedItems': 1,
} as const;

const TRIP_SPENDING_PROJECTION = {
    pointsSpent: 1,
    travelFoodSpent: 1,
    travelHungerLifeLost: 1,
} as const;

const isRefundablePoints = (points: unknown): points is number =>
    Number.isSafeInteger(points) && (points as number) > 0;

@Injectable()
export class StartedQuestCanceller {
    private readonly logger = new Logger(StartedQuestCanceller.name);

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(City.name)
        private readonly cityModel: Model<CityDocument>,
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
        private readonly geography: LoreGeographyReader,
        private readonly wallet: WalletService,
    ) {}

    // dentro la transazione del chiamante, solo dalla cancellazione dell'account (Phase 26 D-13): l'archivio del personaggio non la chiama mai
    // _now resta per simmetria con archiveWithinReporting (l'eraser passa la stessa ora a ogni passo): nessuna regola riusata qui scrive un istante
    async cancelStartedQuestWithin(
        session: ClientSession,
        questId: Types.ObjectId,
        erasedCharacterIds: readonly Types.ObjectId[],
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _now: Date,
    ): Promise<CancelledStartedQuest | null> {
        const quest = await this.questModel
            .findOne(
                {
                    _id: questId,
                    ...startedQuestsWithFilter(erasedCharacterIds),
                },
                { 'infos.markerLocation': 1, registeredAdventurers: 1 },
            )
            .session(session)
            .lean<StartedQuestSnapshot | null>()
            .exec();
        if (!quest) return null;
        const home = await this.homeOf(questId, quest, session);
        const registered = registeredIdsOf(quest.registeredAdventurers);
        const companions = await this.companionsOf(
            registered,
            erasedCharacterIds,
            session,
        );
        const characterIds: Types.ObjectId[] = [];
        for (const companion of companions) {
            if (await this.sendBack(companion, questId, home, session))
                characterIds.push(companion._id);
        }
        const leftBehind = registered.filter(
            (id) => !companions.some((companion) => companion._id.equals(id)),
        );
        await this.dropPendingQuestsOf(leftBehind, questId, session);
        const reset = startedQuestResetOf(questId);
        await this.questModel
            .updateOne(reset.filter, reset.update, { session })
            .exec();
        return { questId, characterIds };
    }

    // un marker senza città (dato rotto) lascia i compagni dove sono: corsia libera e rimborsi comunque
    private async homeOf(
        questId: Types.ObjectId,
        quest: StartedQuestSnapshot,
        session: ClientSession,
    ): Promise<Home> {
        const marker = refIdOf(quest.infos?.markerLocation);
        const city = marker
            ? await this.cityModel.collection.findOne<{
                  markerLocation?: unknown;
              }>(homeCityFilterOf(marker), {
                  projection: { markerLocation: 1 },
                  sort: { _id: 1 },
                  session,
              })
            : null;
        const location = refIdOf(city?.markerLocation);
        if (!location) {
            this.logger.warn(
                `Missione ${questId.toHexString()} annullata senza città di partenza: il marker non appartiene a nessuna città, i compagni restano sul posto`,
            );
            return { location: null, geography: [] };
        }
        return {
            location,
            geography: await this.geography.ofMarker(location, session),
        };
    }

    // registrati attivi che non sono fra i personaggi cancellati: i segnaposto archiviati non rientrano
    private async companionsOf(
        registered: readonly Types.ObjectId[],
        erasedCharacterIds: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<CompanionSnapshot[]> {
        const remaining = registered.filter(
            (id) => !erasedCharacterIds.some((erased) => erased.equals(id)),
        );
        if (remaining.length === 0) return [];
        return this.characterModel
            .find(
                activeRegistrantFilterOf(
                    remaining.map((character) => ({ character })),
                ),
                COMPANION_PROJECTION,
            )
            .session(session)
            .lean<CompanionSnapshot[]>()
            .exec();
    }

    // rientro e rimborsi nello stesso passo in cui sparisce la PendingQuest: nessun rimborso doppio (T-26-17)
    private async sendBack(
        companion: CompanionSnapshot,
        questId: Types.ObjectId,
        home: Home,
        session: ClientSession,
    ): Promise<boolean> {
        const characterHex = companion._id.toHexString();
        const pendingQuestId = refIdOf(companion.quests?.pendingQuest);
        const spending = pendingQuestId
            ? await this.pendingQuestModel
                  .findOne(
                      { _id: pendingQuestId, quest: { $in: idForms(questId) } },
                      TRIP_SPENDING_PROJECTION,
                  )
                  .session(session)
                  .lean<TripSpending | null>()
                  .exec()
            : null;
        if (!pendingQuestId || !spending || companion.status.activeTravel) {
            this.logger.warn(
                `Compagno ${characterHex} della missione ${questId.toHexString()} lasciato intatto: in viaggio o con la corsia su un'altra missione (dato rotto, pulizia manuale)`,
            );
            return false;
        }
        const updated = await this.characterModel
            .updateOne(
                {
                    ...activeCharacterById(companion._id),
                    'quests.pendingQuest': { $in: idForms(pendingQuestId) },
                    'status.activeTravel': null,
                },
                this.sendBackUpdateOf(companion, spending, home),
                { session },
            )
            .exec();
        if (updated.matchedCount !== 1) {
            this.logger.warn(
                `Compagno ${characterHex} della missione ${questId.toHexString()} non riportato in città: corsia cambiata nella transazione`,
            );
            return false;
        }
        await this.pendingQuestModel
            .deleteOne({ _id: pendingQuestId }, { session })
            .exec();
        await this.refundPoints(companion._id, spending.pointsSpent, session);
        return true;
    }

    private sendBackUpdateOf(
        companion: CompanionSnapshot,
        spending: TripSpending,
        home: Home,
    ): Record<string, unknown> {
        const facts = statusFactsOf(companion);
        const life = refundedLifeOf(
            facts.currentLifePoints,
            spending.travelHungerLifeLost ?? 0,
            facts.maxLifePoints,
        );
        const ownedItems = travelRefundOf(
            companion.assets?.ownedItems,
            spending.travelFoodSpent,
        );
        return {
            $set: {
                'quests.pendingQuest': null,
                ...(home.location ? { 'status.location': home.location } : {}),
                ...(life !== facts.currentLifePoints
                    ? { 'status.currentLifePoints': life }
                    : {}),
                ...(ownedItems ? { 'assets.ownedItems': ownedItems } : {}),
            },
            ...knowledgeAdditionOf(home.geography),
        };
    }

    // i punti tornano all'utente che gioca il compagno, dall'unico scrittore dei saldi
    private async refundPoints(
        characterId: Types.ObjectId,
        pointsSpent: unknown,
        session: ClientSession,
    ): Promise<void> {
        if (!isRefundablePoints(pointsSpent)) return;
        const owner = await this.userModel
            .findOne(
                { currentCharacter: { $in: idForms(characterId) } },
                { _id: 1 },
            )
            .session(session)
            .lean<{ _id: Types.ObjectId } | null>()
            .exec();
        if (!owner) {
            this.logger.warn(
                `Punti spesi del compagno ${characterId.toHexString()} non restituiti: nessun utente lo gioca`,
            );
            return;
        }
        await this.wallet.creditUserPoints(owner._id, pointsSpent, session);
    }

    // personaggi cancellati e segnaposto archiviati: la PendingQuest di questa quest sparisce senza rientro né rimborso
    private async dropPendingQuestsOf(
        characterIds: readonly Types.ObjectId[],
        questId: Types.ObjectId,
        session: ClientSession,
    ): Promise<void> {
        if (characterIds.length === 0) return;
        const characterForms = characterIds.flatMap((id) => idForms(id));
        const characters = await this.characterModel
            .find(
                { _id: { $in: characterForms } },
                { 'quests.pendingQuest': 1 },
            )
            .session(session)
            .lean<{ quests?: { pendingQuest?: unknown } | null }[]>()
            .exec();
        const laneIds = characters
            .map((character) => refIdOf(character.quests?.pendingQuest))
            .filter((id): id is Types.ObjectId => id !== null);
        if (laneIds.length === 0) return;
        const ofThisQuest = await this.pendingQuestModel
            .find(
                { _id: { $in: laneIds }, quest: { $in: idForms(questId) } },
                { _id: 1 },
            )
            .session(session)
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        const dropped = ofThisQuest.map(({ _id }) => _id);
        if (dropped.length === 0) return;
        await this.pendingQuestModel
            .deleteMany({ _id: { $in: dropped } }, { session })
            .exec();
        await this.characterModel
            .updateMany(
                {
                    _id: { $in: characterForms },
                    'quests.pendingQuest': {
                        $in: dropped.flatMap((id) => idForms(id)),
                    },
                },
                { $set: { 'quests.pendingQuest': null } },
                { session },
            )
            .exec();
    }
}
