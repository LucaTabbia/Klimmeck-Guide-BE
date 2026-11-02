import {
    ContentConfig,
    ContentTier,
    MAX_DOCUMENT_LEVEL,
} from 'src/content/rules/content-config';
import { isRecord } from 'src/content/loading/records';
import { levelFromPe, tierOfLevel } from 'src/content/rules/enemy-stats';

export interface EnemyFacts {
    tier: ContentTier | null;
    level: number | null;
    pe: number | null;
}

function isDocumentLevel(value: unknown): value is number {
    return (
        Number.isSafeInteger(value) &&
        (value as number) >= 1 &&
        (value as number) <= MAX_DOCUMENT_LEVEL
    );
}

function peOf(source: Record<string, unknown> | null): number | null {
    const pe = source?.pe;
    return typeof pe === 'number' && Number.isFinite(pe) && pe > 0 ? pe : null;
}

// il livello scritto dal documento vince; senza, quello per cui i PE sono uno scontro «Medio» (D-10)
function levelOf(
    source: Record<string, unknown> | null,
    pe: number | null,
    config: ContentConfig,
): number | null {
    if (isDocumentLevel(source?.level)) return source.level;
    return pe === null ? null : levelFromPe(pe, config.mediumPeByLevel);
}

function tierOf(
    raw: Record<string, unknown>,
    level: number | null,
    config: ContentConfig,
): ContentTier | null {
    if (typeof raw.tier === 'string') return raw.tier as ContentTier;
    if (raw.category === 'legendary') return 'legend';
    return level === null ? null : tierOfLevel(level, config.tiers);
}

export function enemyFactsOf(
    raw: Record<string, unknown>,
    config: ContentConfig,
): EnemyFacts {
    const source = isRecord(raw.source) ? raw.source : null;
    const pe = peOf(source);
    const level = levelOf(source, pe, config);
    return { tier: tierOf(raw, level, config), level, pe };
}
