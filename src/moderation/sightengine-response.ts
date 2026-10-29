// forma parziale della risposta di check.json: ogni chiave può mancare (text e text-content condividono `text`, A2)
export type SightengineScores = Partial<Record<string, unknown>>;

export interface SightengineFace {
    attributes?: { age?: { minor?: unknown } | null } | null;
}

export interface SightengineError {
    type?: string;
    code?: number;
    message?: string;
}

export interface SightengineResponse {
    status?: string;
    error?: SightengineError | null;
    nudity?: SightengineScores | null;
    offensive?: SightengineScores | null;
    gore?: { prob?: unknown } | null;
    'self-harm'?: { prob?: unknown } | null;
    faces?: unknown;
    artificial_faces?: unknown;
    text?: SightengineScores | null;
    qr?: SightengineScores | null;
}
