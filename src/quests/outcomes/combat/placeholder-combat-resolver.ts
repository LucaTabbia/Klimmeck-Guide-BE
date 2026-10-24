import { Injectable } from '@nestjs/common';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    CombatContext,
    CombatResolver,
    ParticipantOutcome,
} from './combat-resolver';

@Injectable()
export class PlaceholderCombatResolver extends CombatResolver {
    resolve(
        context: CombatContext,
        chance: ChanceSource,
    ): ParticipantOutcome[] {
        void context;
        void chance;
        throw new Error('not implemented');
    }
}
