import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { OwnedResource } from 'src/authz/ownership/owned-resource';
import { OwnershipGuard } from 'src/authz/ownership/ownership.guard';

export const OWNERSHIP_KEY = 'authz:ownership';

export interface OwnershipRule {
    resource: OwnedResource;
    selectId: (args: Record<string, unknown>) => string;
}

// metadata + guard di metodo: gira sempre dopo l'AuthGuard globale, quindi req.user è già valorizzato
export const OwnsCharacter = <A>(selectId: (args: A) => string) => {
    const rule: OwnershipRule = {
        resource: OwnedResource.character,
        selectId: selectId as unknown as OwnershipRule['selectId'],
    };
    return applyDecorators(
        SetMetadata(OWNERSHIP_KEY, rule),
        UseGuards(OwnershipGuard),
    );
};
