import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
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
import { battleOf, combatContextOf, planCombatant } from './combatant-plan';
import type { GroupRoster } from './group-roster';
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
import { questClaimFilter, questUpdateOf } from './quest-outcome-plan';
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

const awaitingSinceOf = (injured: OutcomeCharacterSnapshot): Date | null => {
    const awaiting = injured.status.awaitingAid as
        | { since?: unknown }
        | null
        | undefined;
    return awaiting?.since instanceof Date ? awaiting.since : null;
};

// id dei feriti della aid in ogni forma salvata (ref ObjectId o stringa legacy)
const woundedIdsOf = (aid: ResolutionQuest): Types.ObjectId[] =>
    (aid.rescue?.characters ?? []).flatMap((character) => {
        const id = refIdOf(character);
        return id ? [id] : [];
    });

const resultIdsFor = (
    ids: readonly Types.ObjectId[],
): Map<string, Types.ObjectId> =>
    new Map(ids.map((id) => [id.toHexString(), new Types.ObjectId()]));

// il ferito più vecchio decide la scadenza: la aid è una sola per tutti
const oldestSinceOf = (
    wounded: readonly OutcomeCharacterSnapshot[],
): Date | null =>
    wounded.reduce<Date | null>((oldest, injured) => {
        const since = awaitingSinceOf(injured);
        if (!since) return oldest;
        return !oldest || since < oldest ? since : oldest;
    }, null);

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
    roster: GroupRoster;
    registeredCount: number;
    woundedIds: Types.ObjectId[];
    woundedResultIds: Map<string, Types.ObjectId>;
    original: ResolutionQuest | null;
    returnCity: ReturnCity;
    catalog: ResolutionCatalog;
    nextAidId: Types.ObjectId;
    now: Date;
}

// log raccolti nel callback e scritti solo dopo il commit: una riesecuzione non li duplica
interface RescueNote {
    warn: boolean;
    message: string;
}

interface Wounded {
    snapshot: OutcomeCharacterSnapshot;
    ownerId: Types.ObjectId | null;
}

interface WoundedStep {
    context: RescueContext;
    wounded: Wounded[];
    session: ClientSession;
    notes: RescueNote[];
}

type WoundedResult = CommittedOutcome['results'][number];

// soccorso di gruppo (D-09 emendata il 2026-10-25): i soccorritori registrati combattono insieme come nel boss (D-05), un solo verdetto libera o uccide tutti i feriti della aid nella stessa transazione
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

    // stessa regola del boss: si risolve quando tutti i soccorritori registrati hanno finito il countdown, senza aspettare che i posti si riempiano
    async resolveRescue(
        loaded: StandardLoad,
        now: Date,
    ): Promise<ResolutionOutcome> {
        const aid = loaded.quest;
        const aidHex = aid._id.toHexString();
        const registered = (aid.registeredAdventurers ?? []).flatMap(
            (seat) => refIdOf(seat.character) ?? [],
        );
        const roster = await this.loader.readGroupRoster(
            aid._id,
            registered,
            now,
        );
        if (roster.waiting) {
            this.logger.log(
                `Soccorso ${aidHex}: non tutti i soccorritori hanno finito il countdown, si attende`,
            );
            return 'waiting';
        }
        if (roster.seats.length === 0) return 'stale';
        const woundedIds = woundedIdsOf(aid);
        const context: RescueContext = {
            loaded,
            roster,
            registeredCount: (aid.registeredAdventurers ?? []).length,
            woundedIds,
            woundedResultIds: resultIdsFor(woundedIds),
            original: await this.readOriginal(aid),
            returnCity: await this.returnCityOf(aid),
            catalog: await this.loader.readCatalog(
                aid,
                roster.seats.map(({ character }) => character),
            ),
            nextAidId: new Types.ObjectId(),
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
                `Soccorso ${aidHex} già risolto o cambiato: nessuna scrittura`,
            );
            return 'stale';
        }
        if (!state.committed) return 'stale';
        this.writeNotes(state.notes);
        for (const characterId of roster.dropped) {
            this.logger.warn(
                `Registrato ${characterId.toHexString()} del soccorso ${aidHex} senza missione in attesa coerente: rimosso`,
            );
        }
        await this.writer.deliver(state.committed);
        this.logger.log(
            `Soccorso ${aidHex} risolto per ${roster.seats.length} soccorritori e ${woundedIds.length} feriti`,
        );
        return 'resolved';
    }

    // D-10: 7 giorni senza esito ⇒ morte di tutti i feriti; sospeso finché la aid ha un soccorritore registrato (C5, confermata dall'utente il 2026-10-25)
    async timeoutAid({
        aidQuestId,
    }: Pick<AidTimeoutTrigger, 'aidQuestId'>): Promise<ResolutionOutcome> {
        const now = this.clock.now();
        const aidHex = aidQuestId.toHexString();
        const aid = await this.questModel
            .findById(aidQuestId, AID_TIMEOUT_PROJECTION)
            .lean<ResolutionQuest | null>()
            .exec();
        if (!aid || aid.concludedAt) return 'stale';
        const woundedIds = woundedIdsOf(aid);
        if (woundedIds.length === 0) return 'stale';
        // lo sweep lo ripete a ogni giro finché il soccorritore resta registrato: debug, non rumore operativo
        if (aidTimeoutSuspended(aid)) {
            this.logger.debug(
                `Soccorso ${aidHex}: un soccorritore è registrato, timeout sospeso`,
            );
            return 'waiting';
        }
        const wounded = await this.characterModel
            .find(
                this.woundedFilter(woundedIds, aidQuestId),
                OUTCOME_CHARACTER_PROJECTION,
            )
            .lean<OutcomeCharacterSnapshot[]>()
            .exec();
        const since = oldestSinceOf(wounded);
        if (!since) return 'stale';
        if (!isAidTimeoutDue(since, now)) return 'waiting';
        const resultIds = resultIdsFor(wounded.map(({ _id }) => _id));
        const state: {
            committed: CommittedOutcome | null;
            unlinked: Types.ObjectId[];
        } = { committed: null, unlinked: [] };
        try {
            await this.connection.transaction(async (session) => {
                // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
                state.committed = null;
                state.unlinked = [];
                // claim prima della morte: l'archivio toglie il morto da rescue.characters e a lista vuota concluderebbe la aid, facendo fallire il claim
                const claimed = await this.questModel
                    .findOneAndUpdate(
                        aidTimeoutClaimFilter(aidQuestId),
                        { $set: { concludedAt: now } },
                        { session, projection: { _id: 1 } },
                    )
                    .lean()
                    .exec();
                if (!claimed) throw new StaleResolution();
                const committed = emptyCommitted();
                for (const injured of wounded) {
                    const death = await this.dieWithin(session, {
                        injured,
                        aid,
                        resultId: resultIds.get(injured._id.toHexString())!,
                        now,
                    });
                    if (death) committed.results.push(death);
                    else state.unlinked.push(injured._id);
                }
                state.committed = committed;
            });
        } catch (error) {
            if (!(error instanceof StaleResolution)) throw error;
            this.logger.log(
                `Soccorso ${aidHex} già concluso o con un soccorritore: nessuna scrittura`,
            );
            return 'stale';
        }
        if (!state.committed) return 'stale';
        for (const injuredId of state.unlinked) {
            this.logger.log(
                `Ferito ${injuredId.toHexString()} già scollegato: nessuna morte da registrare, soccorso ${aidHex} concluso`,
            );
        }
        await this.writer.deliver(state.committed);
        this.logger.log(`Soccorso ${aidHex} scaduto dopo 7 giorni`);
        return 'resolved';
    }

    // un solo combattimento per i soccorritori, poi la aid (claim), poi i feriti; una sconfitta apre UNA nuova aid clonata dall'originale (D-09)
    private async commitRescue(
        context: RescueContext,
        session: ClientSession,
        notes: RescueNote[],
    ): Promise<CommittedOutcome> {
        const { loaded, roster, catalog, now } = context;
        const aid = loaded.quest;
        const rescuers: ResolutionCharacter[] = [];
        for (const seat of roster.seats) {
            rescuers.push(
                await this.loader.snapshotInSession(
                    seat.character._id,
                    seat.pendingQuestId,
                    session,
                ),
            );
        }
        const wounded = await this.woundedInSession(context, session, notes);
        const rescuable = wounded.flatMap(({ snapshot, ownerId }) =>
            ownerId ? [snapshot._id] : [],
        );
        const combatContext = combatContextOf(aid, catalog, rescuers);
        const resolution = combatContext
            ? this.combat.resolve(combatContext, this.chance)
            : null;
        const committed = emptyCommitted();
        const verdicts: Parameters<typeof questUpdateOf>[0]['verdicts'] = [];
        const fallen: Types.ObjectId[] = [];
        for (const [index, seat] of roster.seats.entries()) {
            const snapshot = rescuers[index];
            const {
                plan,
                verdict,
                aid: nextAid,
            } = planCombatant({
                quest: aid,
                catalog,
                snapshot,
                battle: battleOf(resolution, snapshot._id),
                resultId: seat.resultId,
                aidQuestId: context.nextAidId,
                pendingQuestId: seat.pendingQuestId,
                userId: seat.ownerId,
                chance: this.chance,
                rescuedCharacters: rescuable,
                now,
            });
            await this.writer.writeParticipant(plan, session);
            await this.writer.deletePendingQuest(seat.pendingQuestId, session);
            verdicts.push({ characterId: snapshot._id, verdict });
            committed.results.push({
                resultId: seat.resultId,
                userId: seat.ownerId,
            });
            committed.spellRecoveries.push(...plan.spellRecoveries);
            if (nextAid) fallen.push(snapshot._id);
        }
        // claim prima della morte: l'archivio toglie il morto da rescue.characters e a lista vuota concluderebbe la aid, facendo fallire il claim
        await this.writer.updateQuest(
            {
                ...questClaimFilter(
                    aid._id,
                    roster.seats.map(({ character }) => character._id),
                ),
                registeredAdventurers: { $size: context.registeredCount },
            },
            questUpdateOf({
                type: aid.infos.type,
                verdicts,
                dropped: roster.dropped,
                now,
            }),
            session,
            'claim',
        );
        const step: WoundedStep = { context, wounded, session, notes };
        if (fallen.length === 0) {
            committed.results.push(...(await this.liberate(step)));
            return committed;
        }
        committed.results.push(...(await this.kill(step)));
        await this.writer.createAid(
            buildAidQuest(context.original ?? aid, fallen, context.nextAidId),
            session,
        );
        committed.aids.push({ aidQuestId: context.nextAidId, since: now });
        return committed;
    }

    // liberati con gli HP che hanno e riportati al marker della città (D-09): nessuna cura, nessun viaggio
    private async liberate({
        context,
        wounded,
        session,
        notes,
    }: WoundedStep): Promise<WoundedResult[]> {
        const { returnCity, loaded } = context;
        const results: WoundedResult[] = [];
        for (const { snapshot, ownerId } of wounded) {
            const injuredHex = snapshot._id.toHexString();
            if (!ownerId) {
                notes.push({
                    warn: false,
                    message: `Ferito ${injuredHex} già scollegato: nessuna liberazione da registrare`,
                });
                continue;
            }
            if (!returnCity.cityMarker) {
                notes.push({
                    warn: true,
                    message: `Marker ${returnCity.marker?.toHexString() ?? 'assente'} della aid ${loaded.quest._id.toHexString()} in nessuna città: ferito ${injuredHex} liberato dove si trova`,
                });
            }
            const resultId = context.woundedResultIds.get(injuredHex)!;
            const rescued = planRescued({
                resultId,
                snapshot,
                aidQuest: loaded.quest,
                userId: ownerId,
                cityMarker: returnCity.cityMarker,
                now: context.now,
            });
            await this.writer.writeCharacterUpdate(
                rescued.filter,
                rescued.update,
                session,
            );
            await this.writer.writeResult(rescued.result, session);
            results.push({ resultId, userId: ownerId });
        }
        return results;
    }

    // aid fallita (D-09): tutti i feriti muoiono; un ferito già scollegato è un no-op loggato (C1)
    private async kill({
        context,
        wounded,
        session,
        notes,
    }: WoundedStep): Promise<WoundedResult[]> {
        const results: WoundedResult[] = [];
        for (const { snapshot } of wounded) {
            const injuredHex = snapshot._id.toHexString();
            const death = await this.dieWithin(session, {
                injured: snapshot,
                aid: context.loaded.quest,
                resultId: context.woundedResultIds.get(injuredHex)!,
                now: context.now,
            });
            if (death) {
                results.push(death);
                continue;
            }
            notes.push({
                warn: false,
                message: `Ferito ${injuredHex} già scollegato: nessuna morte da registrare`,
            });
        }
        return results;
    }

    // morte nella stessa transazione dell'esito (D-09, D-10): proprietario letto in sessione prima dell'archivio, risultato del suo utente
    private async dieWithin(
        session: ClientSession,
        { injured, aid, resultId, now }: DeathRequest,
    ): Promise<WoundedResult | null> {
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

    // feriti ancora di questa aid: attivi e con awaitingAid.aidQuest = aid
    private woundedFilter(
        woundedIds: readonly Types.ObjectId[],
        aidQuestId: Types.ObjectId,
    ): Record<string, unknown> {
        return {
            ...ACTIVE_CHARACTER_FILTER,
            _id: { $in: woundedIds.flatMap((id) => idForms(id)) },
            'status.awaitingAid.aidQuest': { $in: idForms(aidQuestId) },
        };
    }

    // letti in sessione con il proprietario; chi non è più in attesa di questa aid resta fuori con una nota di soli id
    private async woundedInSession(
        context: RescueContext,
        session: ClientSession,
        notes: RescueNote[],
    ): Promise<Wounded[]> {
        const aidId = context.loaded.quest._id;
        const snapshots = await this.characterModel
            .find(
                this.woundedFilter(context.woundedIds, aidId),
                OUTCOME_CHARACTER_PROJECTION,
            )
            .session(session)
            .lean<OutcomeCharacterSnapshot[]>()
            .exec();
        for (const id of context.woundedIds) {
            if (snapshots.some(({ _id }) => _id.equals(id))) continue;
            notes.push({
                warn: false,
                message: `Ferito ${id.toHexString()} non più in attesa del soccorso ${aidId.toHexString()}: escluso`,
            });
        }
        const wounded: Wounded[] = [];
        for (const snapshot of snapshots) {
            wounded.push({
                snapshot,
                ownerId: await this.ownerInSession(snapshot._id, session),
            });
        }
        return wounded;
    }

    private writeNotes(notes: readonly RescueNote[]): void {
        for (const { warn, message } of notes) {
            if (warn) this.logger.warn(message);
            else this.logger.log(message);
        }
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
