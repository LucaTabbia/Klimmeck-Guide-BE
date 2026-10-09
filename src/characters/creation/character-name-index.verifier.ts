import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    Character,
    CHARACTER_NAME_INDEX,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    describeMongoError,
    isDuplicateKeyError,
} from 'src/mongo/mongo-errors';

const DUPLICATED_NAMES_MESSAGE = `Unique index ${CHARACTER_NAME_INDEX} on characters.infos.name could not be built: some character names collide ignoring case. Rename the colliding characters and restart; until then character names are not guaranteed unique.`;

// non blocca mai il boot: una build d'indice fallita sarebbe altrimenti silenziosa (D-18)
@Injectable()
export class CharacterNameIndexVerifier implements OnApplicationBootstrap {
    private readonly logger = new Logger(CharacterNameIndexVerifier.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.characterModel.createIndexes();
        } catch (error) {
            this.logger.error(
                isDuplicateKeyError(error)
                    ? DUPLICATED_NAMES_MESSAGE
                    : `Indexes on characters could not be built (${describeMongoError(error)}). Character names are not guaranteed unique on characters.infos.name.`,
            );
        }
    }
}
