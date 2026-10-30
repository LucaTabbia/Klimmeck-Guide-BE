import {
    ImageModerator,
    ModerationVerdict,
} from 'src/moderation/image-moderator';

// development e test con le chiavi Sightengine vuote: approva senza rete (il WARN al boot è del reporter)
export class DisabledImageModerator extends ImageModerator {
    readonly enabled = false;

    moderate(): Promise<ModerationVerdict> {
        return Promise.resolve({ approved: true, logged: [] });
    }
}
