import {
    evaluateImagePolicy,
    IMAGE_POLICY,
    MODERATION_THRESHOLD,
} from 'src/moderation/image-policy';
import type { SightengineResponse } from 'src/moderation/sightengine-response';

const CLEAN_NUDITY = {
    sexual_activity: 0.01,
    sexual_display: 0.01,
    erotica: 0.01,
    very_suggestive: 0.01,
    suggestive: 0.01,
    mildly_suggestive: 0.01,
    none: 0.97,
};

const CLEAN_RESPONSE: SightengineResponse = {
    status: 'success',
    nudity: CLEAN_NUDITY,
    offensive: {
        nazi: 0.01,
        asian_swastika: 0.01,
        confederate: 0.01,
        supremacist: 0.01,
        terrorist: 0.01,
        middle_finger: 0.01,
    },
    gore: { prob: 0.01 },
    'self-harm': { prob: 0.01 },
    faces: [],
    artificial_faces: [],
    text: {
        has_artificial: 0.01,
        has_natural: 0.01,
        profanity: [],
        personal: [],
        link: [],
        social: [],
    },
    qr: { personal: [], link: [], social: [], profanity: [], spam: [] },
};

const TEXT_MATCH = { type: 'match', match: 'x' };

function responseWith(patch: SightengineResponse): SightengineResponse {
    return { ...CLEAN_RESPONSE, ...patch };
}

function faceAged(minor: number) {
    return { attributes: { age: { minor } } };
}

describe('image policy (D-13)', () => {
    it('uses a uniform threshold of 0.5', () => {
        expect(MODERATION_THRESHOLD).toBe(0.5);
    });

    it('accepts a clean image without logging anything', () => {
        expect(evaluateImagePolicy(CLEAN_RESPONSE)).toEqual({
            rejected: [],
            logged: [],
        });
    });

    it('rejects explicit nudity above 0.5', () => {
        const response = responseWith({
            nudity: { ...CLEAN_NUDITY, erotica: 0.51 },
        });

        expect(evaluateImagePolicy(response)).toEqual({
            rejected: ['nudity'],
            logged: [],
        });
    });

    it.each(['sexual_activity', 'sexual_display', 'very_suggestive'])(
        'rejects the nudity class %s above 0.5',
        (nudityClass) => {
            const response = responseWith({
                nudity: { ...CLEAN_NUDITY, [nudityClass]: 0.8 },
            });

            expect(evaluateImagePolicy(response).rejected).toEqual(['nudity']);
        },
    );

    it('accepts mild suggestiveness', () => {
        const response = responseWith({
            nudity: {
                ...CLEAN_NUDITY,
                suggestive: 0.9,
                mildly_suggestive: 0.9,
            },
        });

        expect(evaluateImagePolicy(response)).toEqual({
            rejected: [],
            logged: [],
        });
    });

    it('rejects any offensive class above 0.5', () => {
        const response = responseWith({ offensive: { asian_swastika: 0.6 } });

        expect(evaluateImagePolicy(response).rejected).toEqual(['offensive']);
    });

    it('rejects gore above 0.5', () => {
        const response = responseWith({ gore: { prob: 0.7 } });

        expect(evaluateImagePolicy(response).rejected).toEqual(['gore']);
    });

    it('rejects self-harm above 0.5', () => {
        const response = responseWith({ 'self-harm': { prob: 0.7 } });

        expect(evaluateImagePolicy(response).rejected).toEqual(['self-harm']);
    });

    it('rejects a real face estimated as a minor', () => {
        const response = responseWith({
            faces: [faceAged(0.1), faceAged(0.8)],
        });

        expect(evaluateImagePolicy(response)).toEqual({
            rejected: ['minor'],
            logged: [],
        });
    });

    it('only logs an artificial face estimated as a minor', () => {
        const response = responseWith({ artificial_faces: [faceAged(0.9)] });

        expect(evaluateImagePolicy(response)).toEqual({
            rejected: [],
            logged: ['minor-artificial'],
        });
    });

    it('rejects profanity in the text', () => {
        const response = responseWith({
            text: { ...CLEAN_RESPONSE.text, profanity: [TEXT_MATCH] },
        });

        expect(evaluateImagePolicy(response).rejected).toEqual([
            'text-profanity',
        ]);
    });

    it('rejects personal data in the text', () => {
        const response = responseWith({
            text: { ...CLEAN_RESPONSE.text, personal: [TEXT_MATCH] },
        });

        expect(evaluateImagePolicy(response).rejected).toEqual([
            'text-personal',
        ]);
    });

    it.each(['personal', 'link', 'social', 'profanity', 'spam'])(
        'rejects any detected QR content (%s)',
        (qrClass) => {
            const response = responseWith({ qr: { [qrClass]: [TEXT_MATCH] } });

            expect(evaluateImagePolicy(response)).toEqual({
                rejected: ['qr'],
                logged: [],
            });
        },
    );

    it('only logs the presence of text', () => {
        const natural = responseWith({
            text: { ...CLEAN_RESPONSE.text, has_natural: 0.9 },
        });
        const artificial = responseWith({
            text: { ...CLEAN_RESPONSE.text, has_artificial: 0.9 },
        });

        expect(evaluateImagePolicy(natural)).toEqual({
            rejected: [],
            logged: ['text-present'],
        });
        expect(evaluateImagePolicy(artificial)).toEqual({
            rejected: [],
            logged: ['text-present'],
        });
    });

    it('only logs the other text categories', () => {
        const response = responseWith({
            text: { ...CLEAN_RESPONSE.text, link: [TEXT_MATCH] },
        });

        expect(evaluateImagePolicy(response)).toEqual({
            rejected: [],
            logged: ['text-link'],
        });
    });

    it.each([
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
    ])('only logs the text category %s', (textClass) => {
        const response = responseWith({ text: { [textClass]: [TEXT_MATCH] } });

        expect(evaluateImagePolicy(response)).toEqual({
            rejected: [],
            logged: [`text-${textClass}`],
        });
    });

    it('treats exactly 0.5 as below the threshold', () => {
        const response: SightengineResponse = {
            nudity: { erotica: 0.5 },
            offensive: { nazi: 0.5 },
            gore: { prob: 0.5 },
            'self-harm': { prob: 0.5 },
            faces: [faceAged(0.5)],
            artificial_faces: [faceAged(0.5)],
            text: { has_natural: 0.5, has_artificial: 0.5 },
        };

        expect(evaluateImagePolicy(response)).toEqual({
            rejected: [],
            logged: [],
        });
    });

    it.each([
        ['an empty response', {}],
        ['a null text', { text: null }],
        ['faces that are not an array', { faces: 'x' }],
        [
            'a face without attributes',
            { faces: [null, {}, { attributes: {} }] },
        ],
        [
            'non numeric scores',
            { nudity: { erotica: '0.9' }, gore: { prob: true } },
        ],
        [
            'text arrays that are not arrays',
            { text: { profanity: 'x', link: 3 } },
        ],
        ['a null qr', { qr: null }],
    ])('never throws on a response with missing keys (%s)', (_, response) => {
        expect(
            evaluateImagePolicy(response as unknown as SightengineResponse),
        ).toEqual({ rejected: [], logged: [] });
    });

    it('reports every category once in table order', () => {
        const response: SightengineResponse = {
            nudity: { erotica: 0.9, sexual_activity: 0.9 },
            offensive: { nazi: 0.9, terrorist: 0.9 },
            gore: { prob: 0.9 },
            'self-harm': { prob: 0.9 },
            faces: [faceAged(0.9), faceAged(0.9)],
            artificial_faces: [faceAged(0.9), faceAged(0.9)],
            text: {
                has_artificial: 0.9,
                has_natural: 0.9,
                profanity: [TEXT_MATCH, TEXT_MATCH],
                personal: [TEXT_MATCH],
                link: [TEXT_MATCH],
                spam: [TEXT_MATCH],
            },
            qr: { link: [TEXT_MATCH], spam: [TEXT_MATCH] },
        };

        expect(evaluateImagePolicy(response)).toEqual({
            rejected: [
                'nudity',
                'offensive',
                'gore',
                'self-harm',
                'minor',
                'text-profanity',
                'text-personal',
                'qr',
            ],
            logged: [
                'minor-artificial',
                'text-present',
                'text-link',
                'text-spam',
            ],
        });
    });

    it('declares each category of the table exactly once', () => {
        const categories = IMAGE_POLICY.map((rule) => rule.category);

        expect(new Set(categories).size).toBe(categories.length);
    });
});
