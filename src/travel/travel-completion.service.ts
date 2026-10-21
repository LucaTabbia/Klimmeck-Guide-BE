import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { PushService } from 'src/push/push.service';
import { TravelIdentity } from './travel.updates';

export type CompletionOutcome = 'completed' | 'stale';

@Injectable()
export class TravelCompletionService {
    private readonly logger = new Logger(TravelCompletionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly push: PushService,
        private readonly clock: Clock,
    ) {}

    complete(identity: TravelIdentity): Promise<CompletionOutcome> {
        void identity;
        return Promise.reject(new Error('not implemented'));
    }
}
