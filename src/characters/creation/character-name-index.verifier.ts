import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
    Character,
    CHARACTER_NAME_INDEX,
    CharacterDocument,
    LEGACY_CHARACTER_NAME_INDEX,
} from 'src/models/character/character.model';
import {
    describeMongoError,
    isDuplicateKeyError,
    isIndexNotFoundError,
} from 'src/mongo/mongo-errors';

const DUPLICATED_NAMES_MESSAGE = `Unique index ${CHARACTER_NAME_INDEX} on characters.infos.name could not be built: some character names collide ignoring case. Rename the colliding characters and restart; until then character names are not guaranteed unique.`;

// non blocca mai il boot (D-18): una build d'indice fallita sarebbe altrimenti silenziosa;
// costruisce l'indice parziale e poi elimina il legacy (03.1 D-09)
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
            // il vecchio indice resta: meglio nomi archiviati riservati che nessuna unicità
            return;
        }
        await this.dropLegacyNameIndex();
    }

    private async dropLegacyNameIndex(): Promise<void> {
        try {
            await this.characterModel.collection.dropIndex(
                LEGACY_CHARACTER_NAME_INDEX,
            );
            this.logger.log(
                `Dropped legacy index ${LEGACY_CHARACTER_NAME_INDEX}: archived character names are reusable`,
            );
        } catch (error) {
            if (isIndexNotFoundError(error)) return;
            this.logger.error(
                `Legacy index ${LEGACY_CHARACTER_NAME_INDEX} could not be dropped (${describeMongoError(error)}). Names of archived characters stay reserved until it is dropped.`,
            );
        }
    }
}
