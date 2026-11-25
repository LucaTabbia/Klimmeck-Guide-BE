import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AccountDeletionException } from 'src/account/deletion/account-deletion.exception';
import {
    AccountEraser,
    ErasureReport,
} from 'src/account/deletion/account-eraser';
import { DeletedAccount } from 'src/account/deletion/deleted-account.model';
import { AuthException } from 'src/auth/auth.exception';
import { Clock } from 'src/auth/clock';
import { SessionRevocationService } from 'src/auth/session/session-revocation.service';
import { normalizedTwitchLoginOf } from 'src/auth/twitch/twitch-login-name';
import {
    TwitchUserDirectory,
    TwitchUserLookupError,
} from 'src/auth/twitch/twitch-user-directory';
import { User, UserDocument } from 'src/models/user.model';
import { objectIdFromHex } from 'src/mongo/document-id';

@Injectable()
export class AccountDeletionService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(User.name) private readonly users: Model<UserDocument>,
        private readonly eraser: AccountEraser,
        private readonly directory: TwitchUserDirectory,
        private readonly revocation: SessionRevocationService,
        private readonly clock: Clock,
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

    private async twitchIdOfLogin(login: string): Promise<string | null> {
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
        if (state.report) this.afterCommit(state.report);
        return state.report;
    }

    // socket chiusi e registro segnato; push, topic e ritratti arrivano coi piani 11–12
    private afterCommit(report: ErasureReport): void {
        this.revocation.closeDeletedAccountSessions(
            String(report.userId),
            report.revokedSessionIds,
        );
    }
}
