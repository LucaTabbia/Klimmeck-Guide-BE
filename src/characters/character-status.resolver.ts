import { Int, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { maxActiveSpellsFor } from 'src/models/character/active-spell-slots';
import { CharacterStatus } from 'src/models/character/character-status.model';
import { refIdOf } from 'src/mongo/document-id';
import {
    guidedMissionInProgressOf,
    LockLanes,
    lockLanesOf,
    missionInProgressOf,
} from './mission-lock/mission-lock';
import { MissionLockReader } from './mission-lock/mission-lock.reader';

interface StatusParent {
    _id?: unknown;
    quests?: Record<string, unknown> | null;
}

// campo di sola visualizzazione (D-16): l'autorità è la guardia; il PubSub in memoria passa il documento per riferimento (RESEARCH §Q7 (e))
@Resolver(() => CharacterStatus)
export class CharacterStatusResolver {
    constructor(private readonly missionLock: MissionLockReader) {}

    @ResolveField('maxActiveSpells', () => Int)
    maxActiveSpells(@Parent() status: CharacterStatus): number {
        return maxActiveSpellsFor(status.xp ?? 0, status.title);
    }

    @ResolveField('missionInProgress', () => Boolean)
    async missionInProgress(
        @Parent() status: CharacterStatus,
    ): Promise<boolean> {
        const source = this.lanesOrIdOf(status);
        return source instanceof Types.ObjectId
            ? this.missionLock.isLocked(source)
            : missionInProgressOf(source);
    }

    @ResolveField('guidedMissionInProgress', () => Boolean)
    async guidedMissionInProgress(
        @Parent() status: CharacterStatus,
    ): Promise<boolean> {
        const source = this.lanesOrIdOf(status);
        return source instanceof Types.ObjectId
            ? this.missionLock.isGuidedLocked(source)
            : guidedMissionInProgressOf(source);
    }

    // corsie popolate → predicato puro senza letture; corsie come id → l'id del personaggio per il reader; nessun genitore → null
    private lanesOrIdOf(
        status: CharacterStatus,
    ): LockLanes | Types.ObjectId | null {
        const parent = this.parentOf(status);
        if (!parent) return null;
        const lanes = lockLanesOf(parent);
        return lanes === 'unresolved' ? refIdOf(parent._id) : lanes;
    }

    private parentOf(status: CharacterStatus): StatusParent | null {
        const parentOf = (status as { $parent?: unknown }).$parent;
        if (typeof parentOf !== 'function') return null;
        return (parentOf.call(status) as StatusParent | undefined) ?? null;
    }
}
