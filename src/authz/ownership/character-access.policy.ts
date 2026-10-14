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
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { isObjectIdHex } from 'src/mongo/document-id';

interface CurrentCharacterProjection {
    currentCharacter: Types.ObjectId | null;
}

interface PendingQuestProjection {
    quests?: { pendingQuest?: Types.ObjectId | null };
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
    ) {}

    authorize(
        identity: AuthIdentity,
        resource: OwnedResource,
        id: string,
    ): Promise<ResourceAccess> {
        switch (resource) {
            case OwnedResource.character:
                return this.authorizeCharacter(identity, id);
            case OwnedResource.pendingQuest:
                return this.authorizePendingQuest(identity, id);
            default: {
                const unsupported: never = resource;
                throw new Error(
                    `Risorsa non supportata dalla policy: ${String(unsupported)}`,
                );
            }
        }
    }

    // il JWT non porta il personaggio: una sola lettura di users per operazione (D-08); innkeeper esente (D-09);
    // l'esistenza si controlla solo nel ramo di rifiuto, così 403 e 404 restano distinti (D-11)
    async authorizeCharacter(
        identity: AuthIdentity,
        characterId: string,
    ): Promise<ResourceAccess> {
        if (!isObjectIdHex(characterId))
            throw ResourceNotFoundException.character();
        if (
            (await this.readCurrentCharacterId(identity.userId)) === characterId
        ) {
            return ResourceAccess.owner;
        }
        if (identity.role === RoleType.innkeeper)
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
            throw ResourceNotFoundException.pendingQuest();
        if (identity.role === RoleType.innkeeper)
            return ResourceAccess.onBehalf;
        if (
            (await this.readOwnPendingQuestId(identity.userId)) ===
            pendingQuestId
        ) {
            return ResourceAccess.owner;
        }
        if (!(await this.pendingQuestModel.exists({ _id: pendingQuestId }))) {
            throw ResourceNotFoundException.pendingQuest();
        }
        throw AuthorizationException.pendingQuestNotOwned();
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

    private async readOwnPendingQuestId(
        userId: string,
    ): Promise<string | undefined> {
        const characterId = await this.readCurrentCharacterId(userId);
        if (!characterId) return undefined;
        const character = await this.characterModel
            .findById(characterId, { 'quests.pendingQuest': 1 })
            .lean<PendingQuestProjection | null>()
            .exec();
        return character?.quests?.pendingQuest
            ? String(character.quests.pendingQuest)
            : undefined;
    }

    private async assertCharacterExists(characterId: string): Promise<void> {
        if (!(await this.characterModel.exists({ _id: characterId }))) {
            throw ResourceNotFoundException.character();
        }
    }
}
