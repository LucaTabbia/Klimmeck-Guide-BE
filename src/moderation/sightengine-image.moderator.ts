import { Logger } from '@nestjs/common';
import type { SightengineCredentials } from 'src/config/moderation-config';
import { describeError } from 'src/mongo/mongo-errors';
import { ImageModerationUnavailableException } from 'src/moderation/image-moderation.exceptions';
import {
    ImageModerator,
    ModerationImage,
    ModerationVerdict,
} from 'src/moderation/image-moderator';
import { evaluateImagePolicy } from 'src/moderation/image-policy';
import type {
    SightengineError,
    SightengineResponse,
} from 'src/moderation/sightengine-response';

export const SIGHTENGINE_CHECK_URL =
    'https://api.sightengine.com/1.0/check.json';
export const SIGHTENGINE_MODELS =
    'nudity-2.1,offensive-2.0,text-content,face-age,gore-2.0,text,qr-content,self-harm';
export const SIGHTENGINE_TIMEOUT_MS = 5_000;

const UNREADABLE_REASON = 'unreadable';
const MEDIA_ERROR = 'media_error';
const MISCONFIGURATION_ERRORS = ['credentials_error', 'argument_error'];
const FIRST_SERVER_ERROR_STATUS = 500;
const MODEL_SECTIONS: readonly (keyof SightengineResponse)[] = [
    'nudity',
    'offensive',
    'gore',
    'self-harm',
    'faces',
    'text',
    'qr',
];

export class SightengineImageModerator extends ImageModerator {
    readonly enabled = true;
    private readonly logger = new Logger(SightengineImageModerator.name);

    constructor(private readonly credentials: SightengineCredentials) {
        super();
    }

    async moderate(image: ModerationImage): Promise<ModerationVerdict> {
        const response = await this.check(image);
        const verdict = this.verdictOf(response);
        this.logger.log(describeVerdict(verdict));
        return verdict;
    }

    private async check(image: ModerationImage): Promise<SightengineResponse> {
        const response = await this.post(image);
        if (response.status >= FIRST_SERVER_ERROR_STATUS) {
            throw this.unavailable(`HTTP ${response.status}`);
        }
        return this.bodyOf(response);
    }

    private async post(image: ModerationImage): Promise<Response> {
        try {
            return await fetch(SIGHTENGINE_CHECK_URL, {
                method: 'POST',
                body: this.formOf(image),
                signal: AbortSignal.timeout(SIGHTENGINE_TIMEOUT_MS),
            });
        } catch (error) {
            throw this.unavailable(describeError(error));
        }
    }

    private async bodyOf(response: Response): Promise<SightengineResponse> {
        try {
            return (await response.json()) as SightengineResponse;
        } catch (error) {
            throw this.unavailable(describeError(error));
        }
    }

    private formOf(image: ModerationImage): FormData {
        const form = new FormData();
        form.append(
            'media',
            new Blob([Uint8Array.from(image.buffer)], { type: image.mimetype }),
            image.filename,
        );
        form.append('models', SIGHTENGINE_MODELS);
        form.append('api_user', this.credentials.userId);
        form.append('api_secret', this.credentials.secret);
        return form;
    }

    private verdictOf(response: SightengineResponse | null): ModerationVerdict {
        if (response?.status === 'failure')
            return this.failureOf(response.error);
        if (response?.status !== 'success') {
            throw this.unavailable('risposta senza esito');
        }
        if (!hasAnyModelSection(response)) {
            throw this.unavailable('risposta senza modelli');
        }
        const { rejected, logged } = evaluateImagePolicy(response);
        if (rejected.length > 0) {
            return { approved: false, reasons: rejected, logged };
        }
        return { approved: true, logged };
    }

    private failureOf(
        error: SightengineError | null | undefined,
    ): ModerationVerdict {
        const type = error?.type ?? 'unknown_error';
        if (type === MEDIA_ERROR) {
            return {
                approved: false,
                reasons: [UNREADABLE_REASON],
                logged: [],
            };
        }
        if (MISCONFIGURATION_ERRORS.includes(type)) {
            this.logger.error(
                `Sightengine rifiuta la configurazione: ${type}, codice ${error?.code ?? '-'}`,
            );
        }
        throw this.unavailable(type);
    }

    private unavailable(cause: string): ImageModerationUnavailableException {
        this.logger.warn(`Moderazione immagine non disponibile: ${cause}`);
        return new ImageModerationUnavailableException();
    }
}

// una sezione mancante vale «nessuna rilevazione» (Pitfall 13), ma nessuna sezione significa nessun controllo (D-14)
function hasAnyModelSection(response: SightengineResponse): boolean {
    return MODEL_SECTIONS.some((section) => response[section] != null);
}

function describeVerdict(verdict: ModerationVerdict): string {
    const outcome = verdict.approved
        ? 'approvata'
        : `respinta (${verdict.reasons.join(', ')})`;
    const flagged =
        verdict.logged.length > 0
            ? `; da segnalare (${verdict.logged.join(', ')})`
            : '';
    return `Moderazione immagine: ${outcome}${flagged}`;
}
