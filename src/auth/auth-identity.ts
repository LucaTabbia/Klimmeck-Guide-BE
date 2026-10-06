import { RoleType } from 'src/models/enums/role-type.enum';

export interface AuthIdentity {
    userId: string;
    twitchId: string;
    role: RoleType;
    sessionId?: string;
    expiresAt?: number;
}
