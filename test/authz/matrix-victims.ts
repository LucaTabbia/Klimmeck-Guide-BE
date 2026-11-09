// mondo minimo della matrice (Phase 17 D-01): vittime vere, altrimenti l'ownership risponde NOT_FOUND
// (Pitfall 9); attaccanti con sessioni vere, così la matrice non dipende dalla regola sulla sessione
// assente (OQ6)
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { Character } from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { PendingQuest } from 'src/models/pending-quest.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { User, UserDocument } from 'src/models/user.model';
import { buildTestAuthConfig } from '../auth/test-auth-config';
import { signTestAccessToken } from '../auth/test-tokens';
import { buildCharacter, persistCharacter, persistUser } from '../fixtures';
import type { RealAppBoot } from '../harness/real-app-boot';
import { persistQuestResult } from '../quests/quest-result.fixture';
import type { MatrixVictims } from './handler-fixtures';

export const NOT_A_JWT_BEARER = 'Bearer not-a-jwt';
const FOREIGN_JWT_SECRET = 'another-secret-0123456789abcdef-0123456789';
const PENDING_QUEST_START = new Date('2026-10-14T10:00:00.000Z');

export interface MatrixBearers {
    adventurer: string;
    guard: string;
    innkeeper: string;
    victim: string;
}

export interface MatrixWorld {
    victims: MatrixVictims;
    bearers: MatrixBearers;
}

export function foreignSecretBearer(): string {
    return `Bearer ${signTestAccessToken(buildTestAuthConfig({ jwtSecret: FOREIGN_JWT_SECRET }))}`;
}

function modelOf(boot: RealAppBoot, name: string): Model<any> {
    return boot.connection.model(name);
}

// ogni utente ha una sola sessione: una seconda issueForUser revocherebbe la prima (D-02)
async function bearerOf(
    boot: RealAppBoot,
    user: UserDocument,
): Promise<string> {
    const session = await boot.app.get(AuthSessionService).issueForUser(user);
    return `Bearer ${session.accessToken}`;
}

async function persistAttacker(
    boot: RealAppBoot,
    role: RoleType,
): Promise<string> {
    const user = (await persistUser(modelOf(boot, User.name), {
        twitchId: `matrix-${role}`,
        role,
    })) as UserDocument;
    return bearerOf(boot, user);
}

export async function createMatrixWorld(
    boot: RealAppBoot,
): Promise<MatrixWorld> {
    const pendingQuest = await modelOf(boot, PendingQuest.name).create({
        startDate: PENDING_QUEST_START,
        waitingTime: 60,
        quest: new Types.ObjectId(),
    });
    const character = await persistCharacter(
        modelOf(boot, Character.name),
        {
            infos: { ...buildCharacter().infos, name: 'Eroe matrix-victim' },
            quests: {
                ...buildCharacter().quests,
                pendingQuest: pendingQuest._id,
            },
        },
        modelOf(boot, PointOfInterest.name),
    );
    const victim = (await persistUser(modelOf(boot, User.name), {
        twitchId: 'matrix-victim',
        role: RoleType.adventurer,
        currentCharacter: character._id,
    })) as UserDocument;
    const questResult = await persistQuestResult(
        modelOf(boot, QuestResult.name),
        { user: victim._id, character: character._id },
    );
    return {
        victims: {
            characterId: String(character._id),
            pendingQuestId: String(pendingQuest._id),
            questResultId: String(questResult._id),
        },
        bearers: {
            adventurer: await persistAttacker(boot, RoleType.adventurer),
            guard: await persistAttacker(boot, RoleType.guard),
            innkeeper: await persistAttacker(boot, RoleType.innkeeper),
            victim: await bearerOf(boot, victim),
        },
    };
}
