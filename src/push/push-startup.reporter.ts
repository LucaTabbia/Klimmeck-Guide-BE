import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { PUSH_CONFIG } from 'src/config/push-config';
import type { PushConfig } from 'src/config/push-config';

const PUSH_DISABLED_WARNING =
    'Push notifications disabled: FIREBASE_SERVICE_ACCOUNT not configured. Devices are still registered, sends are skipped and sendTestPush answers PUSH_DISABLED.';

// logga solo il project_id (controllo "stesso progetto del FE"), mai client_email né private key (D-06)
@Injectable()
export class PushStartupReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger('Push');

    constructor(@Inject(PUSH_CONFIG) private readonly config: PushConfig) {}

    onApplicationBootstrap(): void {
        const account = this.config.serviceAccount;
        if (!account) {
            this.logger.warn(PUSH_DISABLED_WARNING);
            return;
        }
        this.logger.log(
            `Push notifications enabled for Firebase project ${account.projectId}`,
        );
    }
}
