import { Args, Mutation, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { RegisterPushDeviceInput } from 'src/push/dto/register-push-device.input';
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
}
