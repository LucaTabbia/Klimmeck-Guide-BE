import { Global, Module } from '@nestjs/common';
import {
    RUNTIME_CONFIG,
    runtimeConfigProvider,
} from 'src/config/runtime-config';
import { RuntimeModeReporter } from 'src/config/runtime-mode.reporter';

@Global()
@Module({
    providers: [runtimeConfigProvider, RuntimeModeReporter],
    exports: [RUNTIME_CONFIG],
})
export class RuntimeConfigModule {}
