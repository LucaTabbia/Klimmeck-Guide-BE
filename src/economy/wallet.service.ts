import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import type { CoinPurse } from 'src/economy/coins';
import {
    coinsDeltaStages,
    hasAtLeastCopper,
} from 'src/economy/coins.expressions';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { User, UserDocument } from 'src/models/user.model';

interface CoinsProjection {
    status: { coins: CoinPurse };
}

interface PointsProjection {
    twitchPoints: number;
}

@Injectable()
export class WalletService {
    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    ) {}

    // un solo update condizionale (04 D-02): il filtro è la regola, il server serializza i concorrenti, il saldo non scende mai sotto zero
    async applyCharacterCoinsDelta(
        characterId: Types.ObjectId,
        deltaCopper: number,
        session?: ClientSession,
    ): Promise<CoinPurse> {
        const update = coinsDeltaStages(deltaCopper); // RangeError prima di qualunque scrittura
        const filter =
            deltaCopper < 0
                ? {
                      ...activeCharacterById(characterId),
                      ...hasAtLeastCopper(-deltaCopper),
                  }
                : activeCharacterById(characterId);
        const updated = await this.characterModel
            .findOneAndUpdate(filter, update, {
                session,
                new: true,
                projection: { 'status.coins': 1 },
            })
            .lean<CoinsProjection | null>()
            .exec();
        if (updated) return updated.status.coins;
        throw await this.rejectCoinsWrite(characterId, session);
    }

    private async rejectCoinsWrite(
        characterId: Types.ObjectId,
        session?: ClientSession,
    ): Promise<Error> {
        const exists = await this.characterModel
            .exists(activeCharacterById(characterId))
            .session(session ?? null)
            .exec();
        return exists
            ? GameRuleException.insufficientFunds()
            : ResourceNotFoundException.character();
    }

    // $inc condizionale (04 D-03): un utente senza il campo non passa il $gte, quindi non può andare in negativo; la dedup EventSub resta a Phase 6
    async debitUserPoints(
        userId: Types.ObjectId,
        amount: number,
        session?: ClientSession,
    ): Promise<number> {
        assertPositiveAmount(amount);
        const updated = await this.userModel
            .findOneAndUpdate(
                { _id: userId, twitchPoints: { $gte: amount } },
                { $inc: { twitchPoints: -amount } },
                { session, new: true, projection: { twitchPoints: 1 } },
            )
            .lean<PointsProjection | null>()
            .exec();
        if (updated) return updated.twitchPoints;
        const exists = await this.userModel
            .exists({ _id: userId })
            .session(session ?? null)
            .exec();
        throw exists
            ? GameRuleException.insufficientPoints()
            : ResourceNotFoundException.user();
    }

    async creditUserPoints(
        userId: Types.ObjectId,
        amount: number,
        session?: ClientSession,
    ): Promise<number> {
        assertPositiveAmount(amount);
        const updated = await this.userModel
            .findOneAndUpdate(
                { _id: userId },
                { $inc: { twitchPoints: amount } },
                { session, new: true, projection: { twitchPoints: 1 } },
            )
            .lean<PointsProjection | null>()
            .exec();
        if (!updated) throw ResourceNotFoundException.user();
        return updated.twitchPoints;
    }
}

// $inc accetta anche importi frazionari: la validazione resta nel service
function assertPositiveAmount(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new RangeError(`Importo non valido: ${amount}`);
    }
}
