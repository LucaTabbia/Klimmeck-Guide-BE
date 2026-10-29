import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { describeError } from './mongo-errors';

type IndexedModel = Pick<Model<unknown>, 'createIndexes' | 'collection'>;

// non blocca mai il boot (D-17b): senza indici lo sweep resta corretto, solo più lento; ogni errore viene loggato
@Injectable()
export class SweepIndexVerifier implements OnApplicationBootstrap {
    private readonly logger = new Logger(SweepIndexVerifier.name);
    private readonly models: readonly IndexedModel[];

    constructor(
        @InjectModel(Character.name) characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name) questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(User.name) userModel: Model<UserDocument>,
    ) {
        this.models = [
            characterModel,
            questModel,
            pendingQuestModel,
            userModel,
        ];
    }

    onApplicationBootstrap(): void {
        void this.verifyAll();
    }

    async verifyAll(): Promise<void> {
        for (const model of this.models) {
            await this.verify(model);
        }
    }

    private async verify(model: IndexedModel): Promise<void> {
        try {
            await model.createIndexes();
        } catch (error) {
            this.logger.error(
                `Indici di ${model.collection.collectionName} non costruiti (${describeError(error)}): lo sweep resta corretto ma più lento`,
            );
        }
    }
}
