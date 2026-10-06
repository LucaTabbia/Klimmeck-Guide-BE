import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';

const DUPLICATE_KEY_ERROR_CODE = 11000;

// non blocca mai il boot: ogni errore viene solo loggato (deploy note D-32)
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
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                await this.reportDuplicates();
                return;
            }
            this.logger.error(
                `Indexes on users could not be built (${describeError(error)}). Twitch login upserts are not guaranteed unique on users.twitchId.`,
            );
        }
    }

    private async reportDuplicates(): Promise<void> {
        try {
            const duplicates = await this.usersService.findDuplicateTwitchIds();
            const listed = duplicates
                .map(({ twitchId, count }) => `${twitchId} (${count})`)
                .join(', ');
            this.logger.error(
                `Unique index on users.twitchId could not be built. Duplicated twitchId: ${listed}. Deduplicate users before relying on Twitch login upserts.`,
            );
        } catch (error) {
            this.logger.error(
                `Unique index on users.twitchId could not be built because of duplicated twitchId, and the duplicates could not be listed (${describeError(error)}). Deduplicate users before relying on Twitch login upserts.`,
            );
        }
    }
}

function isDuplicateKeyError(error: unknown): boolean {
    return errorCodeOf(error) === DUPLICATE_KEY_ERROR_CODE;
}

function describeError(error: unknown): string {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const code = errorCodeOf(error);
    return code === undefined ? name : `${name}, code ${code}`;
}

function errorCodeOf(error: unknown): number | string | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const { code } = error as { code?: unknown };
    return typeof code === 'number' || typeof code === 'string'
        ? code
        : undefined;
}
