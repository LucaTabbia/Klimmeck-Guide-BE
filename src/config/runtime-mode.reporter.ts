import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { RUNTIME_CONFIG } from 'src/config/runtime-config';
import type { RuntimeConfig } from 'src/config/runtime-config';

const EMPTY_NODE_ENV_WARNING =
    'NODE_ENV vuoto: avvio in development. In produzione impostare NODE_ENV=production';

// dichiara solo la modalità ammessa, mai altri valori d'ambiente (D-05)
@Injectable()
export class RuntimeModeReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger('Runtime');

    constructor(
        @Inject(RUNTIME_CONFIG) private readonly runtime: RuntimeConfig,
    ) {}

    onApplicationBootstrap(): void {
        if (this.runtime.modeDefaulted)
            this.logger.warn(EMPTY_NODE_ENV_WARNING);
        this.logger.log(
            `Modalità ${this.runtime.mode}: introspection e landing page ${this.introspectionState()}`,
        );
    }

    private introspectionState(): string {
        return this.runtime.production ? 'spente' : 'attive';
    }
}
