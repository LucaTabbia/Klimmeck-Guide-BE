import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { OwnedResource } from 'src/authz/ownership/owned-resource';
import { OwnershipGuard } from 'src/authz/ownership/ownership.guard';

export const OWNERSHIP_KEY = 'authz:ownership';

export interface OwnershipRule {
    resource: OwnedResource;
    selectId: (args: Record<string, unknown>) => string;
    // nessun bypass innkeeper (07 D-11): solo il proprietario, e quindi nessun audit on-behalf
    ownerOnly: boolean;
}

export interface OwnershipOptions {
    ownerOnly?: boolean;
}

// metadata + guard di metodo: gira sempre dopo l'AuthGuard globale, quindi req.user è già valorizzato
function ownsResource<A>(
    resource: OwnedResource,
    selectId: (args: A) => string,
    ownerOnly: boolean,
) {
    const rule: OwnershipRule = {
        resource,
        selectId: selectId as unknown as OwnershipRule['selectId'],
        ownerOnly,
    };
    return applyDecorators(
        SetMetadata(OWNERSHIP_KEY, rule),
        UseGuards(OwnershipGuard),
    );
}

export const OwnsCharacter = <A>(
    selectId: (args: A) => string,
    options: OwnershipOptions = {},
) =>
    ownsResource(OwnedResource.character, selectId, options.ownerOnly ?? false);

export const OwnsPendingQuest = <A>(selectId: (args: A) => string) =>
    ownsResource(OwnedResource.pendingQuest, selectId, false);

// owner-only per utente (D-20, C10): entra sia nelle ownership sia nelle owner-only del boot reale
export const OwnsQuestResult = <A>(selectId: (args: A) => string) =>
    ownsResource(OwnedResource.questResult, selectId, true);
