import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

@Injectable()
export class QuestAcceptanceService {
    accept(
        characterId: Types.ObjectId,
        questId: Types.ObjectId,
        costCopper: number,
    ): Promise<Types.ObjectId> {
        return Promise.reject(
            new Error(
                `accept: not implemented (${String(characterId)}, ${String(questId)}, ${costCopper})`,
            ),
        );
    }
}
