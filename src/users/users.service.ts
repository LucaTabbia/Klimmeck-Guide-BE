import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { RoleType } from 'src/models/enums/role-type.enum';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { CURRENT_CHARACTER_LINK_FILTER } from 'src/models/character/active-character.filter';
import { User, UserDocument } from 'src/models/user.model';
import { isObjectIdHex } from 'src/mongo/document-id';
import { isDuplicateKeyError } from 'src/mongo/mongo-errors';

const DUPLICATE_TWITCH_IDS_PIPELINE: PipelineStage[] = [
    { $group: { _id: '$twitchId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
];

// un riferimento a un archiviato si risolve a null come uno pendente (03.1 D-06), tranne il morto in attesa della conferma del suo foglio (D-12)
const CURRENT_CHARACTER_POPULATE = {
    path: 'currentCharacter',
    match: CURRENT_CHARACTER_LINK_FILTER,
} as const;

interface TwitchIdGroup {
    _id: string;
    count: number;
}

@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
    ) {}

    async findAll(): Promise<User[]> {
        return await this.userModel
            .find()
            .populate(CURRENT_CHARACTER_POPULATE)
            .exec();
    }

    async findOne(id: string): Promise<User> {
        if (!isObjectIdHex(id)) throw ResourceNotFoundException.user();
        const user = await this.userModel
            .findById(id)
            .populate(CURRENT_CHARACTER_POPULATE)
            .exec();
        if (!user) throw ResourceNotFoundException.user();
        return user;
    }

    async findOrCreateByTwitchId(twitchId: string): Promise<UserDocument> {
        return this.retryOnDuplicateKey(() =>
            this.userModel
                .findOneAndUpdate(
                    { twitchId },
                    {
                        $setOnInsert: {
                            twitchPoints: 0,
                            role: RoleType.adventurer,
                            currentCharacter: null,
                        },
                    },
                    { upsert: true, new: true },
                )
                .exec(),
        );
    }

    async upsertWithRole(
        twitchId: string,
        role: RoleType,
    ): Promise<UserDocument> {
        return this.retryOnDuplicateKey(() =>
            this.userModel
                .findOneAndUpdate(
                    { twitchId },
                    {
                        $set: { role },
                        $setOnInsert: {
                            twitchPoints: 0,
                            currentCharacter: null,
                        },
                    },
                    { upsert: true, new: true },
                )
                .exec(),
        );
    }

    async findDuplicateTwitchIds(): Promise<
        Array<{ twitchId: string; count: number }>
    > {
        const groups = await this.userModel
            .aggregate<TwitchIdGroup>(DUPLICATE_TWITCH_IDS_PIPELINE)
            .exec();
        return groups.map(({ _id, count }) => ({ twitchId: _id, count }));
    }

    // Due upsert concorrenti sullo stesso twitchId: uno vince, l'altro riceve un errore di chiave duplicata.
    // Il secondo tentativo trova il documento appena creato.
    private async retryOnDuplicateKey<T>(
        operation: () => Promise<T | null>,
    ): Promise<T> {
        const result = await operation().catch((error: unknown) => {
            if (!isDuplicateKeyError(error)) throw error;
            return operation();
        });
        if (result === null)
            throw new Error('User upsert returned no document');
        return result;
    }
}
