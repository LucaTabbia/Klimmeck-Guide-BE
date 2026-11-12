import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { viewerCacheKeyOf } from 'src/lore/viewer-knowledge.service';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import type { TitleType } from 'src/models/enums/title-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import type { HealSubject } from 'src/quests/outcomes/injuries/heal-no-effect';
import { statusFactsOf } from 'src/quests/outcomes/progression/status-facts';

const VIEWER_VITALS_PROJECTION = {
    'status.title': 1,
    'status.xp': 1,
    'status.currentLifePoints': 1,
    'status.maxLifePoints': 1,
    'status.injuries': 1,
} as const;

interface VitalsCharacter {
    status: {
        title: TitleType;
        xp?: number;
        currentLifePoints?: number;
        maxLifePoints?: number;
        injuries?: unknown[] | null;
    };
}

// vita e ferite del viewer per Quest.noEffect (Phase 18 D-25): una lettura per viewer per richiesta HTTP e per evento WS;
// il payload di un evento è lo stesso oggetto per ogni subscriber, quindi la memo è SEMPRE per viewer dentro la chiave dell'evento (trappola Phase 16)
@Injectable()
export class ViewerVitalsService {
    private readonly cache = new WeakMap<
        object,
        Map<string, Promise<HealSubject | null>>
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
    ): Promise<HealSubject | null> {
        const viewers = this.viewersOf(viewerCacheKeyOf(context, info));
        const viewer = `${identity?.role ?? ''}:${identity?.userId ?? ''}`;
        const cached = viewers.get(viewer);
        if (cached) return cached;
        const read = this.read(identity);
        viewers.set(viewer, read);
        return read;
    }

    private viewersOf(key: object): Map<string, Promise<HealSubject | null>> {
        const known = this.cache.get(key);
        if (known) return known;
        const viewers = new Map<string, Promise<HealSubject | null>>();
        this.cache.set(key, viewers);
        return viewers;
    }

    // nessun ramo sul ruolo: l'oste col proprio personaggio è giudicato come chiunque, come in acceptQuest
    private async read(
        identity: AuthIdentity | undefined,
    ): Promise<HealSubject | null> {
        if (!identity) return null;
        const userId = objectIdFromHex(identity.userId);
        if (userId === null) return null;
        const user = await this.userModel
            .findById(userId, { currentCharacter: 1 })
            .lean<{ currentCharacter?: unknown } | null>()
            .exec();
        const characterId = refIdOf(user?.currentCharacter);
        if (characterId === null) return null;
        const character = await this.characterModel
            .findOne(activeCharacterById(characterId), VIEWER_VITALS_PROJECTION)
            .lean<VitalsCharacter | null>()
            .exec();
        if (character === null) return null;
        const { currentLifePoints, maxLifePoints } = statusFactsOf(character);
        return {
            currentLifePoints,
            maxLifePoints,
            injuries: character.status.injuries ?? [],
        };
    }
}
