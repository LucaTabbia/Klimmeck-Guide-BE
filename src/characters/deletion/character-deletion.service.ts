import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthException } from 'src/auth/auth.exception';
import { Clock } from 'src/auth/clock';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import { CharacterDeletionException } from 'src/characters/deletion/character-deletion.exception';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { User, UserDocument } from 'src/models/user.model';
import { refIdOf } from 'src/mongo/document-id';
import { UsersService } from 'src/users/users.service';

interface LinkedUser {
    currentCharacter: unknown;
}

@Injectable()
export class CharacterDeletionService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly archiver: CharacterArchiver,
        private readonly usersService: UsersService,
        private readonly clock: Clock,
    ) {}

    async deleteCharacter(userId: string): Promise<User> {
        await this.archiveCurrentCharacter(
            new Types.ObjectId(userId),
            DeletionReason.user_request,
        );
        return this.usersService.findOne(userId);
    }

    // il driver ritenta i WriteConflict: il perdente concorrente rilegge currentCharacter a null e risponde CHARACTER_NOT_FOUND;
    // la morte (Phase 9) usa CharacterArchiver.archiveWithin nella transazione dell'esito, non questo metodo
    async archiveCurrentCharacter(
        userId: Types.ObjectId,
        reason: DeletionReason,
    ): Promise<void> {
        await this.connection.transaction(async (session) => {
            const user = await this.userModel
                .findById(userId, { currentCharacter: 1 })
                .session(session)
                .lean<LinkedUser | null>()
                .exec();
            const characterId = refIdOf(user?.currentCharacter);
            if (!characterId) throw await this.rejectUnlinked(userId, session);
            const outcome = await this.archiver.archiveWithin(session, {
                userId,
                characterId,
                reason,
                now: this.clock.now(),
            });
            if (outcome === 'not-linked') {
                throw await this.rejectUnlinked(userId, session);
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
