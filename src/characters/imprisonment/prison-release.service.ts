import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms } from 'src/mongo/document-id';
import { prisonRelease } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';
import { PRISON_RELEASE_UPDATE, prisonReleaseFilter } from './imprisonment';

export type PrisonReleaseOutcome = 'released' | 'stale';

@Injectable()
export class PrisonReleaseService {
    private readonly logger = new Logger(PrisonReleaseService.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly push: PushService,
        private readonly clock: Clock,
    ) {}

    // claim atomico (quick 261110-prp): solo l'update che svuota la data invia la push, una per arresto
    async release(characterId: Types.ObjectId): Promise<PrisonReleaseOutcome> {
        const claim = await this.characterModel
            .updateOne(
                prisonReleaseFilter(characterId, this.clock.now()),
                PRISON_RELEASE_UPDATE,
            )
            .exec();
        if (claim.modifiedCount === 0) return 'stale';
        this.logger.log(
            `Personaggio ${characterId.toHexString()} uscito di prigione`,
        );
        await this.notifyOwner(characterId);
        return 'released';
    }

    // best-effort dopo la scrittura, come travelEnd: un personaggio che nessuno gioca più non riceve push
    private async notifyOwner(characterId: Types.ObjectId): Promise<void> {
        const owner = await this.userModel
            .findOne(
                { currentCharacter: { $in: idForms(characterId) } },
                { _id: 1 },
            )
            .lean<{ _id: Types.ObjectId } | null>()
            .exec();
        if (!owner) return;
        await this.push.sendToUser(
            owner._id,
            prisonRelease(characterId.toHexString()),
        );
    }
}
