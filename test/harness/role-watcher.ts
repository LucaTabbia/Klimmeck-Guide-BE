import type { Model } from 'mongoose';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { SessionService } from 'src/auth/session/session.service';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import type { AuthTestApp } from '../auth/auth-test-app';
import { persistUser } from '../fixtures';

const POLL_INTERVAL_MS = 20;
const DEFAULT_REVOCATION_TIMEOUT_MS = 3000;
const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;
const SENTINEL_TWITCH_ID = 'role-watcher-sentinel';

export interface RevocationState {
    revokedAt: Date | null;
    revokeReason: string | null;
}

interface WatchedUser {
    users: Model<UserDocument>;
    user: UserDocument;
    sessionId: string;
}

let barrierCount = 0;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionsOf(harness: AuthTestApp): Model<SessionDocument> {
    return harness.connection.model<SessionDocument>(Session.name);
}

// il watcher non pubblica nulla: l'unico segnale osservabile è la sessione revocata a DB
export async function waitForRevocation(
    harness: AuthTestApp,
    sessionId: string,
    timeoutMs = DEFAULT_REVOCATION_TIMEOUT_MS,
): Promise<RevocationState> {
    const sessions = sessionsOf(harness);
    const attempts = Math.max(1, Math.ceil(timeoutMs / POLL_INTERVAL_MS));
    for (let attempt = 0; attempt < attempts; attempt++) {
        const session = await sessions
            .findById(sessionId, { revokedAt: 1, revokeReason: 1 })
            .lean()
            .exec();
        if (session?.revokedAt) {
            return {
                revokedAt: session.revokedAt,
                revokeReason: session.revokeReason ?? null,
            };
        }
        await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`session ${sessionId} was never revoked`);
}

async function createWatchedUser(
    harness: AuthTestApp,
    twitchId: string,
): Promise<WatchedUser> {
    const users = harness.connection.model<UserDocument>(User.name);
    const user = await persistUser(users, {
        twitchId,
        role: RoleType.adventurer,
    });
    const { sessionId } = await harness.app
        .get(SessionService)
        .create(String(user._id));
    return { users, user, sessionId };
}

async function changeRole(
    { users, user }: WatchedUser,
    role: RoleType,
): Promise<void> {
    await users.updateOne({ _id: user._id }, { role }).exec();
}

async function removeWatchedUser(
    harness: AuthTestApp,
    { users, user, sessionId }: WatchedUser,
): Promise<void> {
    await sessionsOf(harness).deleteOne({ _id: sessionId }).exec();
    await users.deleteOne({ _id: user._id }).exec();
}

// Pitfall 3: il cursore si apre in modo asincrono e il primo cambio può andare perso; si alterna il ruolo della sentinella finché la sua sessione cade
export async function primeRoleWatcher(harness: AuthTestApp): Promise<void> {
    const sentinel = await createWatchedUser(harness, SENTINEL_TWITCH_ID);
    try {
        for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
            const role =
                attempt % 2 === 1 ? RoleType.guard : RoleType.adventurer;
            await changeRole(sentinel, role);
            const revoked = await waitForRevocation(
                harness,
                sentinel.sessionId,
                PRIMING_WAIT_MS,
            ).catch(() => undefined);
            if (revoked) return;
        }
        throw new Error('role watcher never revoked the sentinel session');
    } finally {
        await removeWatchedUser(harness, sentinel);
    }
}

// barriera: gli eventi dello stream arrivano in ordine e il watcher li revoca in fila, quindi alla revoca della barriera ogni evento precedente è già stato elaborato
export async function flushRoleWatcher(harness: AuthTestApp): Promise<void> {
    barrierCount++;
    const barrier = await createWatchedUser(
        harness,
        `role-watcher-barrier-${barrierCount}`,
    );
    try {
        await changeRole(barrier, RoleType.guard);
        await waitForRevocation(harness, barrier.sessionId);
    } finally {
        await removeWatchedUser(harness, barrier);
    }
}
