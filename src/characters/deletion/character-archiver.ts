import { Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';

export type ArchiveOutcome = 'archived' | 'unlinked' | 'not-linked';

export interface ArchiveRequest {
    userId: Types.ObjectId;
    characterId: Types.ObjectId;
    reason: DeletionReason;
    now: Date;
}

@Injectable()
export class CharacterArchiver {
    archiveWithin(
        _session: ClientSession,
        _request: ArchiveRequest,
    ): Promise<ArchiveOutcome> {
        return Promise.reject(new Error('not implemented'));
    }
}
