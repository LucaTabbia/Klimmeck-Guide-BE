import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RolesGuard } from 'src/authz/roles/roles.guard';
import { RoleType } from 'src/models/enums/role-type.enum';

export const ROLES_KEY = 'authz:roles';

// guard di metodo: gira dopo l'AuthGuard globale per costruzione, senza dipendere dall'ordine degli APP_GUARD;
// ogni futura mutation admin (Phase 7-9) si decora così ed è auditata automaticamente (D-15, D-16)
export const Roles = (...roles: RoleType[]) =>
    applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(RolesGuard));
