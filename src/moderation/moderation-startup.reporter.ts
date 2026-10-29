import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ImageModerator } from 'src/moderation/image-moderator';

const MODERATION_DISABLED_WARNING =
    'Moderazione delle immagini disattivata (SIGHTENGINE_USER_ID / SIGHTENGINE_API_SECRET vuote): gli upload non sono moderati. Obbligatoria con NODE_ENV=production';

// nomina solo le variabili, mai i valori delle credenziali (D-14)
@Injectable()
export class ModerationStartupReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger('Moderation');

    constructor(private readonly moderator: ImageModerator) {}

    onApplicationBootstrap(): void {
        if (!this.moderator.enabled)
            this.logger.warn(MODERATION_DISABLED_WARNING);
    }
}
