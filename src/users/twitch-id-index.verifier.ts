import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class TwitchIdIndexVerifier implements OnApplicationBootstrap {
    private readonly logger = new Logger(TwitchIdIndexVerifier.name);

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly usersService: UsersService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.userModel.createIndexes();
        } catch {
            await this.reportDuplicates();
        }
    }

    private async reportDuplicates(): Promise<void> {
        const duplicates = await this.usersService.findDuplicateTwitchIds();
        const listed = duplicates
            .map(({ twitchId, count }) => `${twitchId} (${count})`)
            .join(', ');
        this.logger.error(
            `Unique index on users.twitchId could not be built. Duplicated twitchId: ${listed}. Deduplicate users before relying on Twitch login upserts.`,
        );
    }
}
