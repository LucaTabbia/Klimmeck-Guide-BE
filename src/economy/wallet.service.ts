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

interface CoinsProjection {
    status: { coins: CoinPurse };
}

@Injectable()
export class WalletService {
    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
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

    debitUserPoints(
        _userId: Types.ObjectId,
        _amount: number,
        _session?: ClientSession,
    ): Promise<number> {
        throw new Error('debitUserPoints: not implemented');
    }

    creditUserPoints(
        _userId: Types.ObjectId,
        _amount: number,
        _session?: ClientSession,
    ): Promise<number> {
        throw new Error('creditUserPoints: not implemented');
    }
}
