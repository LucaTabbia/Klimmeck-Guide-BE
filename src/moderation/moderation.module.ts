import { Module } from '@nestjs/common';
import {
    MODERATION_CONFIG,
    moderationConfigProvider,
} from 'src/config/moderation-config';
import type { ModerationConfig } from 'src/config/moderation-config';
import { DisabledImageModerator } from 'src/moderation/disabled-image.moderator';
import { ImageModerator } from 'src/moderation/image-moderator';
import { ModerationStartupReporter } from 'src/moderation/moderation-startup.reporter';
import { SightengineImageModerator } from 'src/moderation/sightengine-image.moderator';

// chiavi vuote fuori produzione: moderatore disattivato (il boot in produzione è già rifiutato, D-14)
function createImageModerator(config: ModerationConfig): ImageModerator {
    return config.sightengine
        ? new SightengineImageModerator(config.sightengine)
        : new DisabledImageModerator();
}

@Module({
    providers: [
        moderationConfigProvider,
        {
            provide: ImageModerator,
            inject: [MODERATION_CONFIG],
            useFactory: createImageModerator,
        },
        ModerationStartupReporter,
    ],
    exports: [ImageModerator],
})
export class ModerationModule {}
