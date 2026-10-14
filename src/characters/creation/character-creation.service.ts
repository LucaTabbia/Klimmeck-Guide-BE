import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthException } from 'src/auth/auth.exception';
import { CharacterCreationException } from 'src/characters/creation/character-creation.exception';
import { validateCreateCharacterInput } from 'src/characters/creation/create-character-input.validator';
import {
    buildStartingCharacter,
    StartingCharacter,
} from 'src/characters/creation/starting-character';
import { StartingLocationService } from 'src/characters/creation/starting-location.service';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { CreateCharacterInput } from 'src/models/request/create-character-request.model';
import { User, UserDocument } from 'src/models/user.model';
import { isDuplicateKeyOn } from 'src/mongo/mongo-errors';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class CharacterCreationService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly startingLocationService: StartingLocationService,
        private readonly usersService: UsersService,
    ) {}

    async createCharacter(
        userId: string,
        input: CreateCharacterInput,
    ): Promise<User> {
        const normalized = validateCreateCharacterInput(input);
        const locationId = await this.startingLocationService.resolveFor(
            normalized.race,
        );
        await this.claimUserAndInsertCharacter(
            new Types.ObjectId(userId),
            buildStartingCharacter(normalized, locationId),
        );
        return this.usersService.findOne(userId);
    }

    // prima si prenota lo User (claim condizionato), poi si inserisce il Character con l'id già assegnato:
    // il driver ritenta i WriteConflict, il perdente trova currentCharacter valorizzato → ALREADY_EXISTS (D-17)
    private async claimUserAndInsertCharacter(
        userId: Types.ObjectId,
        character: StartingCharacter,
    ): Promise<void> {
        const characterId = new Types.ObjectId();
        try {
            await this.connection.transaction(async (session) => {
                const claimed = await this.userModel
                    .findOneAndUpdate(
                        { _id: userId, currentCharacter: null },
                        { $set: { currentCharacter: characterId } },
                        { session, new: true },
                    )
                    .exec();
                if (!claimed) throw await this.rejectUnclaimed(userId, session);
                await this.characterModel.create(
                    [{ _id: characterId, ...character }],
                    { session },
                );
            });
        } catch (error) {
            if (isDuplicateKeyOn(error, 'infos.name')) {
                throw CharacterCreationException.nameTaken();
            }
            throw error;
        }
    }

    // il claim è nullo anche quando lo User non esiste più (bearer ancora valido di un utente cancellato):
    // la guard verifica solo il JWT, quindi è qui che il caso si distingue da "hai già un personaggio"
    private async rejectUnclaimed(
        userId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Error> {
        const exists = await this.userModel
            .exists({ _id: userId })
            .session(session);
        return exists
            ? CharacterCreationException.alreadyExists()
            : AuthException.unauthenticated();
    }
}
