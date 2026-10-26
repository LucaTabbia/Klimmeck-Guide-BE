import type { Types } from 'mongoose';
import type { ResolutionCharacter } from './resolution-loader.service';

// un posto del gruppo che combatte insieme (boss D-05, soccorso di gruppo D-09): personaggio in corsia, la sua PendingQuest e il proprietario
export interface GroupSeat {
    character: ResolutionCharacter;
    pendingQuestId: Types.ObjectId;
    ownerId: Types.ObjectId;
    resultId: Types.ObjectId;
}

// waiting = almeno un registrato non ha finito il countdown; dropped = registrati senza una PendingQuest coerente (Pitfall 8)
export interface GroupRoster {
    seats: GroupSeat[];
    dropped: Types.ObjectId[];
    waiting: boolean;
}
