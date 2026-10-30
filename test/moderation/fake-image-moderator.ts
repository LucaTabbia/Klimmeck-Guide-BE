import { ImageModerationUnavailableException } from 'src/moderation/image-moderation.exceptions';
import {
    ImageModerator,
    ModerationImage,
    ModerationVerdict,
} from 'src/moderation/image-moderator';

type ScriptedOutcome =
    | { kind: 'approve' }
    | { kind: 'reject'; reasons: string[] }
    | { kind: 'fail' };

// sostituisce SightengineImageModerator nell'harness: nessuna rete, esiti scriptati in coda, di default approva
export class FakeImageModerator extends ImageModerator {
    readonly enabled = true;
    readonly calls: ModerationImage[] = [];
    private readonly script: ScriptedOutcome[] = [];

    approveNext(): void {
        this.script.push({ kind: 'approve' });
    }

    rejectNext(reasons: string[]): void {
        this.script.push({ kind: 'reject', reasons: [...reasons] });
    }

    failNext(): void {
        this.script.push({ kind: 'fail' });
    }

    reset(): void {
        this.calls.length = 0;
        this.script.length = 0;
    }

    moderate(image: ModerationImage): Promise<ModerationVerdict> {
        this.calls.push(image);
        const outcome = this.script.shift() ?? { kind: 'approve' };
        if (outcome.kind === 'fail') {
            return Promise.reject(new ImageModerationUnavailableException());
        }
        if (outcome.kind === 'reject') {
            return Promise.resolve({
                approved: false,
                reasons: outcome.reasons,
                logged: [],
            });
        }
        return Promise.resolve({ approved: true, logged: [] });
    }
}
