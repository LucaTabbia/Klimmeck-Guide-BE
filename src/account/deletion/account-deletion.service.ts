import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AccountDeletionException } from 'src/account/deletion/account-deletion.exception';
import {
    AccountEraser,
    ErasureReport,
} from 'src/account/deletion/account-eraser';
import { DeletedAccount } from 'src/account/deletion/deleted-account.model';
import { PortraitDeletionSweeper } from 'src/account/deletion/portrait/portrait-deletion.sweeper';
import { AuthException } from 'src/auth/auth.exception';
import { Clock } from 'src/auth/clock';
import { SessionRevocationService } from 'src/auth/session/session-revocation.service';
import {
    normalizedTwitchLoginOf,
    type TwitchLogin,
} from 'src/auth/twitch/twitch-login-name';
import {
    TwitchUserDirectory,
    TwitchUserLookupError,
} from 'src/auth/twitch/twitch-user-directory';
import { User, UserDocument } from 'src/models/user.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import { startedQuestCancelled } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';
import { notifyQuestCancelled } from 'src/quests/party/registered-release';

@Injectable()
export class AccountDeletionService {
    private readonly logger = new Logger(AccountDeletionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(User.name) private readonly users: Model<UserDocument>,
        private readonly eraser: AccountEraser,
        private readonly directory: TwitchUserDirectory,
        private readonly revocation: SessionRevocationService,
        private readonly clock: Clock,
        private readonly push: PushService,
        private readonly portraitSweeper: PortraitDeletionSweeper,
    ) {}

    // identità dal bearer (Phase 26 D-20): l'oste è rifiutato dall'eraser (D-16), un utente sparito è UNAUTHENTICATED
    async deleteOwnAccount(userId: string): Promise<boolean> {
        const id = objectIdFromHex(userId);
        if (!id) throw AuthException.unauthenticated();
        const report = await this.erase(id);
        if (!report) throw AuthException.unauthenticated();
        return true;
    }

    // nome utente dalle email delle pagine legali (Phase 26 D-15): mai salvato né loggato (D-25);
    // stessa cancellazione della via propria (regola dura 1), l'oste è rifiutato dall'eraser (D-16)
    async deleteByTwitchLogin(rawLogin: string): Promise<DeletedAccount> {
        const login = normalizedTwitchLoginOf(rawLogin);
        if (!login) throw AccountDeletionException.twitchUserNotFound();
        const twitchId = await this.twitchIdOfLogin(login);
        if (!twitchId) throw AccountDeletionException.twitchUserNotFound();
        const user = await this.users
            .findOne({ twitchId }, { _id: 1 })
            .lean<{ _id: Types.ObjectId }>()
            .exec();
        if (!user) throw AccountDeletionException.accountNotFound();
        const report = await this.erase(user._id);
        if (!report) throw AccountDeletionException.accountNotFound();
        return { twitchId };
    }

    private async twitchIdOfLogin(login: TwitchLogin): Promise<string | null> {
        try {
            return await this.directory.userIdOfLogin(login);
        } catch (error) {
            if (error instanceof TwitchUserLookupError) {
                throw AccountDeletionException.twitchUnavailable();
            }
            throw error;
        }
    }

    // una transazione, poi i passi dopo il commit (Phase 26 regola dura 5)
    private async erase(userId: Types.ObjectId): Promise<ErasureReport | null> {
        const state: { report: ErasureReport | null } = { report: null };
        await this.connection.transaction(async (session) => {
            // il callback viene rieseguito sui WriteConflict: lo stato riparte da zero
            state.report = null;
            state.report = await this.eraser.eraseWithin(
                session,
                userId,
                this.clock.now(),
            );
        });
        if (state.report) await this.afterCommitSafely(state.report);
        return state.report;
    }

    // la cancellazione è già scritta: nessun errore dei passi esterni risale alla mutation né cambia l'esito del registro (regola dura 5)
    private async afterCommitSafely(report: ErasureReport): Promise<void> {
        try {
            await this.afterCommit(report);
        } catch (error) {
            this.logger.warn(
                `Passi dopo la cancellazione dell'account ${report.userId.toHexString()} interrotti: ${describeError(error)}`,
            );
        }
    }

    // ordine fisso (D-13, D-25, N6): socket e device rimasti, compagni rientrati, soccorritori liberati, topic, spinta ai ritratti
    private async afterCommit(report: ErasureReport): Promise<void> {
        await this.closeSessions(report);
        const lateTokens = await this.removeLateDevices(report);
        for (const { questId, characterIds } of report.cancelled) {
            await notifyQuestCancelled(
                this.users,
                this.push,
                questId,
                characterIds,
                this.logger,
                startedQuestCancelled(questId.toHexString()),
            );
        }
        for (const { questId, characterIds } of report.released) {
            await notifyQuestCancelled(
                this.users,
                this.push,
                questId,
                characterIds,
                this.logger,
            );
        }
        await this.push.unsubscribeFromStreamerLive([
            ...new Set([...report.pushTokens, ...lateTokens]),
        ]);
        // la risposta non aspetta Cloudinary (WR-01): lo sweeper consegna, gli errori li registra lui
        this.portraitSweeper.kick();
    }

    // come la seconda passata delle sessioni (WR-03): un device registrato fra la lettura della transazione e il commit (U-02);
    // nel log solo id interno e conteggi, mai un token
    private async removeLateDevices(report: ErasureReport): Promise<string[]> {
        try {
            const tokens = await this.push.removeDevicesOf(report.userId);
            if (tokens.length > 0) {
                this.logger.warn(
                    `Rimossi ${tokens.length} device registrati durante la cancellazione dell'account ${report.userId.toHexString()}`,
                );
            }
            return tokens;
        } catch (error) {
            this.logger.warn(
                `Rimozione dei device rimasti dell'account ${report.userId.toHexString()} fallita: ${describeError(error)}`,
            );
            return [];
        }
    }

    // un errore qui non deve fermare push, topic e ritratti; le sessioni nate da un login in gara si revocano qui (WR-03)
    private async closeSessions(report: ErasureReport): Promise<void> {
        try {
            await this.revocation.closeDeletedAccountSessions(
                String(report.userId),
                report.revokedSessionIds,
            );
        } catch (error) {
            this.logger.warn(
                `Chiusura delle sessioni dell'account ${report.userId.toHexString()} fallita: ${describeError(error)}`,
            );
        }
    }
}
