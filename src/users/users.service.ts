import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument, UserInput } from 'src/models/user.model';
import { isDuplicateKeyError } from 'src/mongo/mongo-errors';

const DUPLICATE_TWITCH_IDS_PIPELINE: PipelineStage[] = [
    { $group: { _id: '$twitchId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
];

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
        return await this.userModel.find().populate('currentCharacter').exec();
    }

    async findOne(id: string): Promise<User> {
        const user = await this.userModel
            .findById(id)
            .populate('currentCharacter')
            .exec();
        if (!user) throw new NotFoundException(`User with id ${id} not found`);
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

    async create(userData: Partial<UserInput>): Promise<User> {
        const createdUser = new this.userModel(userData);
        return await createdUser.save();
    }

    async update(updatedUser: Partial<UserInput>): Promise<User> {
        const user = await this.userModel
            .findByIdAndUpdate(updatedUser.id, updatedUser, { new: true })
            .exec();
        if (!user)
            throw new NotFoundException(
                `User with id ${updatedUser.id} not found`,
            );
        return user;
    }

    async delete(id: string): Promise<User> {
        const user = await this.userModel.findByIdAndDelete(id).exec();
        if (!user) throw new NotFoundException(`User with id ${id} not found`);
        return user;
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
