import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import {
    LoreVisibility,
    SEES_EVERYTHING,
    SEES_NOTHING,
    visibilityOf,
} from './lore-visibility';

const VIEWER_KNOWLEDGE_PROJECTION = {
    'status.unlockedLore': 1,
    'status.knownEnemies': 1,
} as const;

interface ViewerCharacter {
    status?: { unlockedLore?: unknown[]; knownEnemies?: unknown[] } | null;
}

// sotto graphql-ws il context è lo stesso per tutti gli eventi di una subscription, il rootValue no (Pitfall 1)
export function viewerCacheKeyOf(
    context: object,
    info?: { rootValue?: unknown },
): object {
    const root = info?.rootValue;
    return typeof root === 'object' && root !== null ? root : context;
}

// il payload di un evento è lo stesso oggetto per ogni subscriber del topic: la chiave interna separa i viewer
function viewerKeyOf(identity: AuthIdentity | undefined): string {
    return `${identity?.role ?? ''}:${identity?.userId ?? ''}`;
}

// conoscenza del viewer (Phase 16 D-07, D-10, D-13): innkeeper tutto, giocatore il suo personaggio
// corrente attivo, nessuno nulla; una lettura per viewer per richiesta HTTP e per evento WS
@Injectable()
export class ViewerKnowledgeService {
    private readonly cache = new WeakMap<
        object,
        Map<string, Promise<LoreVisibility>>
    >();

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
    ) {}

    of(
        identity: AuthIdentity | undefined,
        context: object,
        info?: { rootValue?: unknown },
    ): Promise<LoreVisibility> {
        const viewers = this.viewersOf(viewerCacheKeyOf(context, info));
        const viewer = viewerKeyOf(identity);
        const cached = viewers.get(viewer);
        if (cached) return cached;
        const read = this.read(identity);
        viewers.set(viewer, read);
        return read;
    }

    private viewersOf(key: object): Map<string, Promise<LoreVisibility>> {
        const known = this.cache.get(key);
        if (known) return known;
        const viewers = new Map<string, Promise<LoreVisibility>>();
        this.cache.set(key, viewers);
        return viewers;
    }

    private async read(
        identity: AuthIdentity | undefined,
    ): Promise<LoreVisibility> {
        if (!identity) return SEES_NOTHING;
        if (identity.role === RoleType.innkeeper) return SEES_EVERYTHING;
        const userId = objectIdFromHex(identity.userId);
        if (userId === null) return SEES_NOTHING;
        const user = await this.userModel
            .findById(userId, { currentCharacter: 1 })
            .lean<{ currentCharacter?: unknown } | null>()
            .exec();
        const characterId = refIdOf(user?.currentCharacter);
        if (characterId === null) return SEES_NOTHING;
        // il morto in attesa del foglio è ancora collegato allo User ma non ha più una vista (D-13)
        const character = await this.characterModel
            .findOne(
                activeCharacterById(characterId),
                VIEWER_KNOWLEDGE_PROJECTION,
            )
            .lean<ViewerCharacter | null>()
            .exec();
        return visibilityOf(character?.status);
    }
}
