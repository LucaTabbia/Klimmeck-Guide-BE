import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthException } from 'src/auth/auth.exception';
import { CharacterDeletionException } from 'src/characters/deletion/character-deletion.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { User, UserDocument } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';

interface UnlinkedUser {
    currentCharacter: Types.ObjectId | null;
}

@Injectable()
export class CharacterDeletionService {
    private readonly logger = new Logger(CharacterDeletionService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly usersService: UsersService,
    ) {}

    async deleteCharacter(userId: string): Promise<User> {
        await this.archiveCurrentCharacter(
            new Types.ObjectId(userId),
            DeletionReason.user_request,
        );
        return this.usersService.findOne(userId);
    }

    // claim inverso (03.1 D-05): solo chi ha ancora un personaggio lo scollega; il driver ritenta i WriteConflict
    // e il perdente concorrente trova currentCharacter a null → CHARACTER_NOT_FOUND. Riusato dalla Phase 9 con DeletionReason.death
    async archiveCurrentCharacter(
        userId: Types.ObjectId,
        reason: DeletionReason,
    ): Promise<void> {
        await this.connection.transaction(async (session) => {
            const unlinked = await this.userModel
                .findOneAndUpdate(
                    { _id: userId, currentCharacter: { $ne: null } },
                    { $set: { currentCharacter: null } },
                    {
                        session,
                        returnDocument: 'before',
                        projection: { currentCharacter: 1 },
                    },
                )
                .lean<UnlinkedUser | null>()
                .exec();
            if (!unlinked?.currentCharacter) {
                throw await this.rejectUnlinked(userId, session);
            }
            const archived = await this.characterModel
                .updateOne(
                    activeCharacterById(unlinked.currentCharacter),
                    { $set: { deletedAt: new Date(), deletionReason: reason } },
                    { session },
                )
                .exec();
            if (archived.matchedCount === 0) {
                // riferimento pendente o già archiviato: si scollega comunque, altrimenti l'utente non potrebbe né creare né eliminare
                this.logger.warn(
                    `User ${String(userId)} pointed to a missing or archived character: unlinked anyway`,
                );
            }
        });
    }

    // claim nullo anche per un bearer valido di uno User cancellato: la guard verifica solo il JWT
    private async rejectUnlinked(
        userId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Error> {
        const exists = await this.userModel
            .exists({ _id: userId })
            .session(session);
        return exists
            ? CharacterDeletionException.notFound()
            : AuthException.unauthenticated();
    }
}
