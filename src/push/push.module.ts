import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { pushConfigProvider } from 'src/config/push-config';
import { User, UserSchema } from 'src/models/user.model';
import { PushDeviceIndexVerifier } from 'src/push/push-device-index.verifier';
import { PushDevice, PushDeviceSchema } from 'src/push/push-device.model';
import { PushDeviceRegistry } from 'src/push/push-device.registry';
import { PushStartupReporter } from 'src/push/push-startup.reporter';
import { PushResolver } from 'src/push/push.resolver';
import { PushService } from 'src/push/push.service';
import { pushTransportProvider } from 'src/push/transport/push-transport.provider';

// modulo foglia, non @Global: Phase 6/8/9 importano PushModule e iniettano PushService (RESEARCH OQ10);
// User registrato localmente per i controlli di esistenza, senza trascinare UsersModule (change stream) nei consumatori
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: PushDevice.name, schema: PushDeviceSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    providers: [
        pushConfigProvider,
        { provide: Clock, useClass: SystemClock },
        pushTransportProvider,
        PushDeviceRegistry,
        PushDeviceIndexVerifier,
        PushService,
        PushResolver,
        PushStartupReporter,
    ],
    exports: [PushService],
})
export class PushModule {}
