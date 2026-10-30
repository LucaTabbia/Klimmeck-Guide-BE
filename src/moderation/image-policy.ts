import type {
    SightengineFace,
    SightengineResponse,
    SightengineScores,
} from 'src/moderation/sightengine-response';

export const MODERATION_THRESHOLD = 0.5;

export interface PolicyRule {
    category: string;
    action: 'reject' | 'log';
    matches: (response: SightengineResponse) => boolean;
}

export interface PolicyEvaluation {
    rejected: string[];
    logged: string[];
}

const EXPLICIT_NUDITY_CLASSES = [
    'sexual_activity',
    'sexual_display',
    'erotica',
    'very_suggestive',
];

const OFFENSIVE_CLASSES = [
    'nazi',
    'asian_swastika',
    'confederate',
    'supremacist',
    'terrorist',
    'middle_finger',
];

const QR_CLASSES = ['personal', 'link', 'social', 'profanity', 'spam'];

const LOGGED_TEXT_CLASSES = [
    'link',
    'social',
    'extremism',
    'medical',
    'drug',
    'weapon',
    'content-trade',
    'money-transaction',
    'spam',
    'violence',
    'self-harm',
];

function exceedsThreshold(score: unknown): boolean {
    return typeof score === 'number' && score > MODERATION_THRESHOLD;
}

function anyScoreExceeds(
    scores: SightengineScores | null | undefined,
    classes: readonly string[],
): boolean {
    return classes.some((name) => exceedsThreshold(scores?.[name]));
}

function isNonEmptyList(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0;
}

function anyListPresent(
    scores: SightengineScores | null | undefined,
    classes: readonly string[],
): boolean {
    return classes.some((name) => isNonEmptyList(scores?.[name]));
}

function anyMinorFace(faces: unknown): boolean {
    if (!Array.isArray(faces)) return false;
    return faces.some((face: SightengineFace | null) =>
        exceedsThreshold(face?.attributes?.age?.minor),
    );
}

function textList(name: string): PolicyRule['matches'] {
    return (response) => isNonEmptyList(response.text?.[name]);
}

export const IMAGE_POLICY: readonly PolicyRule[] = [
    {
        category: 'nudity',
        action: 'reject',
        matches: (response) =>
            anyScoreExceeds(response.nudity, EXPLICIT_NUDITY_CLASSES),
    },
    {
        category: 'offensive',
        action: 'reject',
        matches: (response) =>
            anyScoreExceeds(response.offensive, OFFENSIVE_CLASSES),
    },
    {
        category: 'gore',
        action: 'reject',
        matches: (response) => exceedsThreshold(response.gore?.prob),
    },
    {
        category: 'self-harm',
        action: 'reject',
        matches: (response) => exceedsThreshold(response['self-harm']?.prob),
    },
    {
        category: 'minor',
        action: 'reject',
        matches: (response) => anyMinorFace(response.faces),
    },
    {
        category: 'minor-artificial',
        action: 'log',
        matches: (response) => anyMinorFace(response.artificial_faces),
    },
    {
        category: 'text-profanity',
        action: 'reject',
        matches: textList('profanity'),
    },
    {
        category: 'text-personal',
        action: 'reject',
        matches: textList('personal'),
    },
    {
        category: 'qr',
        action: 'reject',
        matches: (response) => anyListPresent(response.qr, QR_CLASSES),
    },
    {
        category: 'text-present',
        action: 'log',
        matches: (response) =>
            anyScoreExceeds(response.text, ['has_artificial', 'has_natural']),
    },
    ...LOGGED_TEXT_CLASSES.map(
        (name): PolicyRule => ({
            category: `text-${name}`,
            action: 'log',
            matches: textList(name),
        }),
    ),
];

export function evaluateImagePolicy(
    response: SightengineResponse,
): PolicyEvaluation {
    const matched = IMAGE_POLICY.filter((rule) => rule.matches(response));
    return {
        rejected: categoriesOf(matched, 'reject'),
        logged: categoriesOf(matched, 'log'),
    };
}

function categoriesOf(
    rules: readonly PolicyRule[],
    action: PolicyRule['action'],
): string[] {
    return rules
        .filter((rule) => rule.action === action)
        .map((rule) => rule.category);
}
