import { Args, Mutation, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';
import { PushDeliveryReport } from 'src/push/dto/push-delivery-report.model';
import { RegisterPushDeviceInput } from 'src/push/dto/register-push-device.input';
import { SendTestPushInput } from 'src/push/dto/send-test-push.input';
import { PushService } from 'src/push/push.service';

@Resolver()
export class PushResolver {
    constructor(private readonly pushService: PushService) {}

    // identità solo dal bearer (D-02): nessun userId in input; ammessa a ogni autenticato, anche senza personaggio
    @Mutation(() => Boolean)
    registerPushDevice(
        @CurrentUser() identity: AuthIdentity,
        @Args('input') input: RegisterPushDeviceInput,
    ): Promise<boolean> {
        return this.pushService.registerDevice(identity.userId, input);
    }

    // da chiamare PRIMA di logout e al cambio account (D-03); idempotente
    @Mutation(() => Boolean)
    unregisterPushDevice(
        @CurrentUser() identity: AuthIdentity,
        @Args('deviceId', { type: () => String }) deviceId: string,
    ): Promise<boolean> {
        return this.pushService.unregisterDevice(identity.userId, deviceId);
    }

    // attrezzo del game master (D-13): FORBIDDEN per gli altri ruoli e audit automatico in admin_audit_logs (Phase 3 D-15/D-16)
    @Roles(RoleType.innkeeper)
    @Mutation(() => PushDeliveryReport)
    sendTestPush(
        @CurrentUser() identity: AuthIdentity,
        @Args('input') input: SendTestPushInput,
    ): Promise<PushDeliveryReport> {
        return this.pushService.sendTest(identity.userId, input);
    }
}
