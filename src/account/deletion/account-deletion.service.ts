import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
    AccountEraser,
    ErasureReport,
} from 'src/account/deletion/account-eraser';
import { AuthException } from 'src/auth/auth.exception';
import { Clock } from 'src/auth/clock';
import { SessionRevocationService } from 'src/auth/session/session-revocation.service';
import { objectIdFromHex } from 'src/mongo/document-id';

@Injectable()
export class AccountDeletionService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        private readonly eraser: AccountEraser,
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
