import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthorizationException } from 'src/authz/authorization.exception';
import {
    OwnedResource,
    ResourceAccess,
} from 'src/authz/ownership/owned-resource';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { User, UserDocument } from 'src/models/user.model';
import { isObjectIdHex } from 'src/mongo/document-id';
import { BadUserInputException } from 'src/validation/bad-user-input.exception';
import {
    QUEST_LANES,
    QuestLane,
    lanePathOf,
} from 'src/quests/acceptance/quest-lanes';

interface CurrentCharacterProjection {
    currentCharacter: Types.ObjectId | null;
}

interface QuestResultOwnerProjection {
    user?: unknown;
}

interface PendingQuestProjection {
    quests?: Partial<Record<QuestLane, Types.ObjectId | null>>;
}

// le tre corsie (07 D-11, C4): proprietario di un PendingQuest è chi lo ha in una qualunque corsia del proprio personaggio
const OWN_PENDING_QUESTS_PROJECTION = Object.fromEntries(
    QUEST_LANES.map((lane) => [lanePathOf(lane), 1]),
);

export interface CharacterAccessOptions {
    ownerOnly?: boolean;
}

@Injectable()
export class CharacterAccessPolicy {
    private readonly logger = new Logger(CharacterAccessPolicy.name);

    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
    ) {}

    authorize(
        identity: AuthIdentity,
        resource: OwnedResource,
        id: string,
        options: CharacterAccessOptions = {},
    ): Promise<ResourceAccess> {
        switch (resource) {
            case OwnedResource.character:
                return this.authorizeCharacter(identity, id, options);
            case OwnedResource.pendingQuest:
                return this.authorizePendingQuest(identity, id);
            case OwnedResource.questResult:
                return this.authorizeQuestResult(identity, id);
            default: {
                const unsupported: never = resource;
                throw new Error(
                    `Risorsa non supportata dalla policy: ${String(unsupported)}`,
                );
            }
        }
    }

    // il JWT non porta il personaggio: una sola lettura di users per operazione (D-08); innkeeper esente (D-09) salvo ownerOnly (07 D-11);
    // l'esistenza si controlla solo nel ramo di rifiuto, così 403 e 404 restano distinti (D-11)
    async authorizeCharacter(
        identity: AuthIdentity,
        characterId: string,
        options: CharacterAccessOptions = {},
    ): Promise<ResourceAccess> {
        // le guard girano prima delle pipe (C1): l'id malformato è input non valido, non una risorsa assente
        if (!isObjectIdHex(characterId)) throw BadUserInputException.of(['id']);
        if (
            (await this.readCurrentCharacterId(identity.userId)) === characterId
        ) {
            return ResourceAccess.owner;
        }
        if (identity.role === RoleType.innkeeper && !options.ownerOnly)
            return ResourceAccess.onBehalf;
        await this.assertCharacterExists(characterId);
        throw AuthorizationException.notOwner();
    }

    // PendingQuest non referenzia il personaggio: la proprietà si risolve dal personaggio del bearer (D-10)
    async authorizePendingQuest(
        identity: AuthIdentity,
        pendingQuestId: string,
    ): Promise<ResourceAccess> {
        if (!isObjectIdHex(pendingQuestId))
            throw BadUserInputException.of(['id']);
        if (identity.role === RoleType.innkeeper)
            return ResourceAccess.onBehalf;
        if (
            (await this.readOwnPendingQuestIds(identity.userId)).includes(
                pendingQuestId,
            )
        ) {
            return ResourceAccess.owner;
        }
        if (!(await this.pendingQuestModel.exists({ _id: pendingQuestId }))) {
            throw ResourceNotFoundException.pendingQuest();
        }
        throw AuthorizationException.pendingQuestNotOwned();
    }

    // proprietario = utente del risultato (D-20): vale anche dopo la morte, con currentCharacter ancora sul morto o già nullo; nessun bypass innkeeper (C10)
    async authorizeQuestResult(
        identity: AuthIdentity,
        resultId: string,
    ): Promise<ResourceAccess> {
        if (!isObjectIdHex(resultId)) throw BadUserInputException.of(['id']);
        const result = await this.questResultModel
            .findById(resultId, { user: 1 })
            .lean<QuestResultOwnerProjection | null>()
            .exec();
        if (!result) throw ResourceNotFoundException.questResult();
        if (String(result.user) === identity.userId)
            return ResourceAccess.owner;
        throw AuthorizationException.questResultNotOwned();
    }

    // difesa in profondità per ogni evento live: un errore non deve chiudere lo stream né far trapelare l'evento
    async mayReceiveCharacterEvent(
        identity: AuthIdentity,
        characterId: string,
    ): Promise<boolean> {
        if (identity.role === RoleType.innkeeper) return true;
        try {
            return (
                (await this.readCurrentCharacterId(identity.userId)) ===
                characterId
            );
        } catch (error) {
            this.logger.warn(
                `Verifica di proprietà dell'evento fallita: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }

    private async readCurrentCharacterId(
        userId: string,
    ): Promise<string | undefined> {
        // il ref è salvato come ObjectId senza cast: si confronta la sua forma stringa
        const user = await this.userModel
            .findById(userId, { currentCharacter: 1 })
            .lean<CurrentCharacterProjection | null>()
            .exec();
        return user?.currentCharacter
            ? String(user.currentCharacter)
            : undefined;
    }

    private async readOwnPendingQuestIds(userId: string): Promise<string[]> {
        const characterId = await this.readCurrentCharacterId(userId);
        if (!characterId) return [];
        const character = await this.characterModel
            .findOne(
                activeCharacterById(characterId),
                OWN_PENDING_QUESTS_PROJECTION,
            )
            .lean<PendingQuestProjection | null>()
            .exec();
        return QUEST_LANES.map((lane) => character?.quests?.[lane])
            .filter((id): id is Types.ObjectId => id != null)
            .map(String);
    }

    // un archiviato vale come inesistente (03.1 D-06): NOT_FOUND per tutti, nessun oracolo FORBIDDEN/NOT_FOUND
    private async assertCharacterExists(characterId: string): Promise<void> {
        if (
            !(await this.characterModel.exists(
                activeCharacterById(characterId),
            ))
        ) {
            throw ResourceNotFoundException.character();
        }
    }
}
