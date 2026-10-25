import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { buildAidQuest } from './aid/aid-quest';
import {
    aidTimeoutClaimFilter,
    aidTimeoutSuspended,
    isAidTimeoutDue,
} from './aid/aid-timeout';
import { ChanceSource } from './chance-source';
import { CombatResolver } from './combat/combat-resolver';
import {
    battleOf,
    type CombatantBattle,
    combatContextOf,
    planCombatant,
} from './combatant-plan';
import {
    OUTCOME_CHARACTER_PROJECTION,
    type OutcomeCharacterSnapshot,
} from './outcome-plan';
import {
    type CommittedOutcome,
    emptyCommitted,
    OutcomeWriter,
    StaleResolution,
} from './outcome-writer.service';
import { questUpdateOf } from './quest-outcome-plan';
import {
    type ResolutionCatalog,
    type ResolutionCharacter,
    ResolutionLoader,
    type ResolutionOutcome,
    type ResolutionQuest,
    type StandardLoad,
} from './resolution-loader.service';
import { deathResultOf, planRescued } from './rescue-plan';
import type { AidTimeoutTrigger } from './scheduling/quest-resolution-job';

const ORIGINAL_QUEST_PROJECTION = {
    infos: 1,
    requirements: 1,
    prizes: 1,
} as const;

const AID_TIMEOUT_PROJECTION = {
    infos: 1,
    rescue: 1,
    concludedAt: 1,
    registeredAdventurers: 1,
} as const;

const awaitingSinceOf = (
    injured: OutcomeCharacterSnapshot | null,
): Date | null => {
    const awaiting = injured?.status.awaitingAid as
        | { since?: unknown }
        | null
        | undefined;
    return awaiting?.since instanceof Date ? awaiting.since : null;
};

interface DeathRequest {
    injured: OutcomeCharacterSnapshot;
    aid: ResolutionQuest;
    resultId: Types.ObjectId;
    now: Date;
}

interface ReturnCity {
    marker: Types.ObjectId | null;
    cityMarker: Types.ObjectId | null;
}

interface RescueContext {
    loaded: StandardLoad;
    injuredId: Types.ObjectId;
    injuredOwner: Types.ObjectId | null;
    original: ResolutionQuest | null;
    returnCity: ReturnCity;
    catalog: ResolutionCatalog;
    resultId: Types.ObjectId;
    injuredResultId: Types.ObjectId;
    aidQuestId: Types.ObjectId;
    now: Date;
}

// log raccolti nel callback e scritti solo dopo il commit: una riesecuzione non li duplica
interface RescueNote {
    warn: boolean;
    message: string;
}

interface InjuredStep {
    context: RescueContext;
    snapshot: OutcomeCharacterSnapshot | null;
    session: ClientSession;
    notes: RescueNote[];
}

type InjuredResult = CommittedOutcome['results'][number] | null;

// catena di soccorso (D-09): l'esito del soccorritore decide liberazione o morte del ferito nella stessa transazione
@Injectable()
export class RescueResolutionService {
    private readonly logger = new Logger(RescueResolutionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
        private readonly loader: ResolutionLoader,
        private readonly writer: OutcomeWriter,
        private readonly archiver: CharacterArchiver,
        private readonly combat: CombatResolver,
        private readonly chance: ChanceSource,
        private readonly clock: Clock,
    ) {}

    async resolveRescue(
        loaded: StandardLoad,
        now: Date,
    ): Promise<ResolutionOutcome> {
        const aid = loaded.quest;
        // transitorio: 09-18 Task 2
        const injuredId = refIdOf(aid.rescue?.characters?.[0]);
        if (!injuredId) return 'stale';
        const owners = await this.loader.ownersOf([injuredId]);
        const context: RescueContext = {
            loaded,
            injuredId,
            injuredOwner: owners.get(injuredId.toHexString()) ?? null,
            original: await this.readOriginal(aid),
            returnCity: await this.returnCityOf(aid),
            catalog: await this.loader.readCatalog(aid, [loaded.character]),
            resultId: new Types.ObjectId(),
            injuredResultId: new Types.ObjectId(),
            aidQuestId: new Types.ObjectId(),
            now,
        };
        const state: {
            committed: CommittedOutcome | null;
            notes: RescueNote[];
        } = { committed: null, notes: [] };
        try {
            await this.connection.transaction(async (session) => {
                // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
                state.committed = null;
                state.notes = [];
                state.committed = await this.commitRescue(
                    context,
                    session,
                    state.notes,
                );
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            this.logger.log(
                `Soccorso ${aid._id.toHexString()} già risolto o cambiato: nessuna scrittura`,
            );
            return 'stale';
        }
        if (!state.committed) return 'stale';
        for (const { warn, message } of state.notes) {
            if (warn) this.logger.warn(message);
            else this.logger.log(message);
        }
        await this.writer.deliver(state.committed);
        this.logger.log(
            `Soccorso ${aid._id.toHexString()} risolto per il ferito ${injuredId.toHexString()}`,
        );
        return 'resolved';
    }

    // D-10: 7 giorni senza esito ⇒ morte; sospeso finché la aid ha un soccorritore registrato (C5, confermata dall'utente il 2026-10-25)
    async timeoutAid({
        aidQuestId,
    }: Pick<AidTimeoutTrigger, 'aidQuestId'>): Promise<ResolutionOutcome> {
        const now = this.clock.now();
        const aidHex = aidQuestId.toHexString();
        const aid = await this.questModel
            .findById(aidQuestId, AID_TIMEOUT_PROJECTION)
            .lean<ResolutionQuest | null>()
            .exec();
        // transitorio: 09-18 Task 2
        const injuredId = refIdOf(aid?.rescue?.characters?.[0]);
        if (!aid || aid.concludedAt || !injuredId) return 'stale';
        // lo sweep lo ripete a ogni giro finché il soccorritore resta registrato: debug, non rumore operativo
        if (aidTimeoutSuspended(aid)) {
            this.logger.debug(
                `Soccorso ${aidHex}: un soccorritore è registrato, timeout sospeso`,
            );
            return 'waiting';
        }
        const injured = await this.characterModel
            .findOne(
                {
                    ...activeCharacterById(injuredId),
                    'status.awaitingAid.aidQuest': { $in: idForms(aidQuestId) },
                },
                OUTCOME_CHARACTER_PROJECTION,
            )
            .lean<OutcomeCharacterSnapshot | null>()
            .exec();
        const since = awaitingSinceOf(injured);
        if (!injured || !since) return 'stale';
        if (!isAidTimeoutDue(since, now)) return 'waiting';
        const resultId = new Types.ObjectId();
        const state: { committed: CommittedOutcome | null; died: boolean } = {
            committed: null,
            died: false,
        };
        try {
            await this.connection.transaction(async (session) => {
                // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
                state.committed = null;
                state.died = false;
                const claimed = await this.questModel
                    .findOneAndUpdate(
                        aidTimeoutClaimFilter(aidQuestId),
                        { $set: { concludedAt: now } },
                        { session, projection: { _id: 1 } },
                    )
                    .lean()
                    .exec();
                if (!claimed) throw new StaleResolution();
                const death = await this.dieWithin(session, {
                    injured,
                    aid,
                    resultId,
                    now,
                });
                state.died = death !== null;
                state.committed = {
                    ...emptyCommitted(),
                    results: death ? [death] : [],
                };
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            this.logger.log(
                `Soccorso ${aidHex} già concluso o con un soccorritore: nessuna scrittura`,
            );
            return 'stale';
        }
        if (!state.committed) return 'stale';
        if (!state.died) {
            this.logger.log(
                `Ferito ${injuredId.toHexString()} già scollegato: nessuna morte da registrare, soccorso ${aidHex} concluso`,
            );
        }
        await this.writer.deliver(state.committed);
        this.logger.log(`Soccorso ${aidHex} scaduto dopo 7 giorni`);
        return 'resolved';
    }

    // soccorritore come nel ramo individuale, poi il ferito; una sconfitta apre una nuova aid clonata dall'originale (D-09)
    private async commitRescue(
        context: RescueContext,
        session: ClientSession,
        notes: RescueNote[],
    ): Promise<CommittedOutcome> {
        const { loaded, injuredId, now } = context;
        const aid = loaded.quest;
        const rescuer = await this.loader.snapshotInSession(
            loaded.character._id,
            loaded.pendingQuest._id,
            session,
        );
        const injured = await this.injuredInSession(
            injuredId,
            aid._id,
            session,
        );
        const {
            plan,
            verdict,
            aid: nextAid,
        } = planCombatant({
            quest: aid,
            catalog: context.catalog,
            snapshot: rescuer,
            battle: this.fight(aid, context.catalog, rescuer),
            resultId: context.resultId,
            aidQuestId: context.aidQuestId,
            pendingQuestId: loaded.pendingQuest._id,
            userId: loaded.ownerId,
            chance: this.chance,
            // transitorio: 09-18 Task 2
            rescuedCharacters: injured ? [injuredId] : [],
            now,
        });
        await this.writer.writeParticipant(plan, session);
        await this.writer.deletePendingQuest(loaded.pendingQuest._id, session);
        await this.writer.updateQuest(
            { _id: aid._id },
            questUpdateOf({
                type: aid.infos.type,
                verdicts: [{ characterId: rescuer._id, verdict }],
                now,
            }),
            session,
            'bestEffort',
        );
        const step: InjuredStep = {
            context,
            snapshot: injured,
            session,
            notes,
        };
        const injuredResult =
            verdict === QuestOutcome.success
                ? await this.liberate(step)
                : await this.kill(step);
        if (nextAid) {
            await this.writer.createAid(
                // transitorio: 09-18 Task 2
                buildAidQuest(
                    context.original ?? aid,
                    [rescuer._id],
                    context.aidQuestId,
                ),
                session,
            );
        }
        return {
            results: [
                { resultId: context.resultId, userId: loaded.ownerId },
                ...(injuredResult ? [injuredResult] : []),
            ],
            aids: nextAid
                ? [{ aidQuestId: context.aidQuestId, since: now }]
                : [],
            spellRecoveries: plan.spellRecoveries,
        };
    }

    // liberato con gli HP che ha e riportato al marker della città (D-09): nessuna cura, nessun viaggio
    private async liberate({
        context,
        snapshot,
        session,
        notes,
    }: InjuredStep): Promise<InjuredResult> {
        const { injuredId, injuredOwner, returnCity } = context;
        if (!snapshot || !injuredOwner) {
            notes.push({
                warn: false,
                message: `Ferito ${injuredId.toHexString()} già scollegato: nessuna liberazione da registrare`,
            });
            return null;
        }
        if (!returnCity.cityMarker) {
            notes.push({
                warn: true,
                message: `Marker ${returnCity.marker?.toHexString() ?? 'assente'} della aid ${context.loaded.quest._id.toHexString()} in nessuna città: ferito ${injuredId.toHexString()} liberato dove si trova`,
            });
        }
        const rescued = planRescued({
            resultId: context.injuredResultId,
            snapshot,
            aidQuest: context.loaded.quest,
            userId: injuredOwner,
            cityMarker: returnCity.cityMarker,
            now: context.now,
        });
        await this.writer.writeCharacterUpdate(
            rescued.filter,
            rescued.update,
            session,
        );
        await this.writer.writeResult(rescued.result, session);
        return { resultId: context.injuredResultId, userId: injuredOwner };
    }

    // aid fallita (D-09): il ferito muore; un ferito già scollegato è un no-op loggato (C1)
    private async kill({
        context,
        snapshot,
        session,
        notes,
    }: InjuredStep): Promise<InjuredResult> {
        const death = snapshot
            ? await this.dieWithin(session, {
                  injured: snapshot,
                  aid: context.loaded.quest,
                  resultId: context.injuredResultId,
                  now: context.now,
              })
            : null;
        if (!death) {
            notes.push({
                warn: false,
                message: `Ferito ${context.injuredId.toHexString()} già scollegato: nessuna morte da registrare`,
            });
        }
        return death;
    }

    // morte nella stessa transazione dell'esito (D-09, D-10): proprietario letto in sessione prima dell'archivio, risultato del suo utente
    private async dieWithin(
        session: ClientSession,
        { injured, aid, resultId, now }: DeathRequest,
    ): Promise<InjuredResult> {
        const owner = await this.ownerInSession(injured._id, session);
        if (!owner) return null;
        const archived = await this.archiver.archiveWithin(session, {
            userId: owner,
            characterId: injured._id,
            reason: DeletionReason.death,
            now,
        });
        if (archived !== 'archived') return null;
        await this.writer.writeResult(
            deathResultOf({
                resultId,
                snapshot: injured,
                quest: aid,
                userId: owner,
                now,
            }),
            session,
        );
        return { resultId, userId: owner };
    }

    // il combattimento passa solo dalla porta (D-02)
    private fight(
        aid: ResolutionQuest,
        catalog: ResolutionCatalog,
        rescuer: ResolutionCharacter,
    ): CombatantBattle | null {
        const context = combatContextOf(aid, catalog, [rescuer]);
        if (!context) return null;
        return battleOf(this.combat.resolve(context, this.chance), rescuer._id);
    }

    // il ferito è ancora quello di questa aid: attivo e con awaitingAid.aidQuest = aid
    private injuredInSession(
        injuredId: Types.ObjectId,
        aidQuestId: Types.ObjectId,
        session: ClientSession,
    ): Promise<OutcomeCharacterSnapshot | null> {
        return this.characterModel
            .findOne(
                {
                    ...activeCharacterById(injuredId),
                    'status.awaitingAid.aidQuest': { $in: idForms(aidQuestId) },
                },
                OUTCOME_CHARACTER_PROJECTION,
            )
            .session(session)
            .lean<OutcomeCharacterSnapshot | null>()
            .exec();
    }

    // proprietario letto in sessione prima dell'archivio: dopo l'archivio currentCharacter è null
    private async ownerInSession(
        injuredId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Types.ObjectId | null> {
        const owner = await this.userModel
            .findOne(
                { currentCharacter: { $in: idForms(injuredId) } },
                { _id: 1 },
            )
            .session(session)
            .lean<{ _id: Types.ObjectId } | null>()
            .exec();
        return owner?._id ?? null;
    }

    // una catena clona sempre la quest originale; se è stata eliminata si clona la aid stessa (titolo mai raddoppiato)
    private async readOriginal(
        aid: ResolutionQuest,
    ): Promise<ResolutionQuest | null> {
        const originalId = refIdOf(aid.rescue?.failedQuest);
        if (!originalId) return null;
        return this.questModel
            .findById(originalId, ORIGINAL_QUEST_PROJECTION)
            .lean<ResolutionQuest | null>()
            .exec();
    }

    // città del ritorno (D-09): quella che contiene il marker della aid fra i punti di interesse
    private async returnCityOf(aid: ResolutionQuest): Promise<ReturnCity> {
        const marker = refIdOf(aid.infos.markerLocation);
        if (!marker) return { marker, cityMarker: null };
        const city = await this.cityModel
            .findOne(
                {
                    $or: [
                        { pointsOfInterest: { $in: idForms(marker) } },
                        { markerLocation: { $in: idForms(marker) } },
                    ],
                },
                { markerLocation: 1 },
            )
            .lean<{ markerLocation?: unknown } | null>()
            .exec();
        return { marker, cityMarker: refIdOf(city?.markerLocation) };
    }
}
