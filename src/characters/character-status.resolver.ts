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

type LanePredicate = (lanes: LockLanes) => boolean;
type LaneQuery = (
    reader: MissionLockReader,
    characterId: Types.ObjectId,
) => Promise<boolean>;

// campo di sola visualizzazione (D-16): l'autorità è la guardia; il PubSub in memoria passa il documento per riferimento (RESEARCH §Q7 (e))
@Resolver(() => CharacterStatus)
export class CharacterStatusResolver {
    constructor(private readonly missionLock: MissionLockReader) {}

    @ResolveField('maxActiveSpells', () => Int)
    maxActiveSpells(@Parent() status: CharacterStatus): number {
        return maxActiveSpellsFor(status.xp ?? 0, status.title);
    }

    @ResolveField('missionInProgress', () => Boolean)
    missionInProgress(@Parent() status: CharacterStatus): Promise<boolean> {
        return this.flagOf(status, missionInProgressOf, (reader, id) =>
            reader.isLocked(id),
        );
    }

    @ResolveField('guidedMissionInProgress', () => Boolean)
    guidedMissionInProgress(
        @Parent() status: CharacterStatus,
    ): Promise<boolean> {
        return this.flagOf(status, guidedMissionInProgressOf, (reader, id) =>
            reader.isGuidedLocked(id),
        );
    }

    private async flagOf(
        status: CharacterStatus,
        predicate: LanePredicate,
        query: LaneQuery,
    ): Promise<boolean> {
        const parent = this.parentOf(status);
        if (!parent) return false;

        const lanes = lockLanesOf(parent);
        if (lanes === null) return false;
        if (lanes !== 'unresolved') return predicate(lanes);

        const characterId = refIdOf(parent._id);
        return characterId ? query(this.missionLock, characterId) : false;
    }

    private parentOf(status: CharacterStatus): StatusParent | null {
        const parentOf = (status as { $parent?: unknown }).$parent;
        if (typeof parentOf !== 'function') return null;
        return (parentOf.call(status) as StatusParent | undefined) ?? null;
    }
}
