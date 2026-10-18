import { Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';
import type { CoinPurse } from 'src/economy/coins';

@Injectable()
export class WalletService {
    applyCharacterCoinsDelta(
        _characterId: Types.ObjectId,
        _deltaCopper: number,
        _session?: ClientSession,
    ): Promise<CoinPurse> {
        throw new Error('applyCharacterCoinsDelta: not implemented');
    }
}
