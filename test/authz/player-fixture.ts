import type { Model, Schema } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import type { UserDocument } from 'src/models/user.model';
import type { AuthTestApp } from '../auth/auth-test-app';
import { createAuthenticatedUser } from '../auth/test-tokens';
import { buildCharacter, persistCharacter } from '../fixtures';

export interface PlayerOptions {
    twitchId: string;
    role?: RoleType; // default RoleType.adventurer
    withCharacter?: boolean; // default true
    characterOverrides?: Record<string, unknown>; // es. { quests: { completedQuests: [], pendingQuest: id } }
}

export interface TestPlayer {
    user: UserDocument;
    character: CharacterDocument | null;
    bearer: string;
}

// giocatore con sessione JWT vera: il ruolo nel token è quello salvato sullo User (D-12)
export async function createPlayer(
    harness: AuthTestApp,
    options: PlayerOptions,
): Promise<TestPlayer> {
    const character =
        options.withCharacter === false
            ? null
            : await persistOwnedCharacter(harness, options);
    const { user, bearer } = await createAuthenticatedUser(harness, {
        twitchId: options.twitchId,
        role: options.role ?? RoleType.adventurer,
        currentCharacter: character?._id ?? null,
    });
    return { user, character, bearer };
}

// l'harness registra User e Character tramite UsersModule, non PointOfInterest
function modelOf(
    harness: AuthTestApp,
    name: string,
    schema: Schema,
): Model<any> {
    return (
        harness.connection.models[name] ??
        harness.connection.model(name, schema)
    );
}

// nome distinto per l'indice unico character_name_active_ci_unique su infos.name
async function persistOwnedCharacter(
    harness: AuthTestApp,
    options: PlayerOptions,
): Promise<CharacterDocument> {
    return (await persistCharacter(
        modelOf(harness, Character.name, CharacterSchema),
        {
            infos: {
                ...buildCharacter().infos,
                name: `Eroe ${options.twitchId}`,
            },
            ...options.characterOverrides,
        },
        modelOf(harness, PointOfInterest.name, PointOfInterestSchema),
    )) as CharacterDocument;
}
