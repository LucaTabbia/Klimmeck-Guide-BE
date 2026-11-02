import { QUEST_DESCRIPTIONS } from 'src/content/generation/quest-descriptions';
import type { DescriptionKind } from 'src/content/generation/quest-descriptions';

const NAMES = { city: 'Borgo di Prova', enemy: 'Bestia di Prova' };

const KINDS: DescriptionKind[] = [
    'heal',
    'job',
    'guard',
    'crime',
    'study',
    'spellStudy',
    'innJob',
    'hunt',
    'dungeon',
];

const USER_HEAL_NOTICE =
    'A tutti gli avventurieri feriti! Abbiamo allestito una piccola clinica nei pressi del tempio, attendiamo il vostro arrivo con la speranza di poter alleggerire il vostro dolore.';

function noticesOf(kind: DescriptionKind): string[] {
    return QUEST_DESCRIPTIONS[kind].map((notice) => notice(NAMES));
}

describe('QUEST_DESCRIPTIONS', () => {
    it('offers at least three notices per quest kind (D-32)', () => {
        expect(Object.keys(QUEST_DESCRIPTIONS).sort()).toEqual(
            [...KINDS].sort(),
        );
        for (const kind of KINDS) {
            expect(QUEST_DESCRIPTIONS[kind].length).toBeGreaterThanOrEqual(3);
        }
    });

    it('writes one to three Italian sentences per notice (D-32)', () => {
        for (const kind of KINDS) {
            for (const notice of noticesOf(kind)) {
                const sentences = notice.match(/[.!?](\s|$)/g) ?? [];
                expect(sentences.length).toBeGreaterThanOrEqual(1);
                expect(sentences.length).toBeLessThanOrEqual(3);
                expect(notice).toBe(notice.trim());
                expect(notice).not.toContain('\n');
                expect(notice).not.toMatch(/\$\{|\{city\}|\{enemy\}/);
            }
        }
    });

    it('names the city in every notice but the temple call of the user (D-32)', () => {
        for (const kind of KINDS) {
            noticesOf(kind).forEach((notice, variant) => {
                if (kind === 'heal' && variant === 0) return;
                expect(notice).toContain(NAMES.city);
            });
        }
    });

    it('uses the euphonic preposition before a city starting with a vowel (D-32)', () => {
        const vowelNames = { city: 'Anden', enemy: 'Ankheg' };
        for (const kind of KINDS) {
            for (const notice of QUEST_DESCRIPTIONS[kind]) {
                expect(notice(vowelNames)).not.toContain(' a Anden');
            }
        }
        expect(
            KINDS.flatMap((kind) =>
                QUEST_DESCRIPTIONS[kind].map((notice) => notice(vowelNames)),
            ).some((text) => text.includes(' ad Anden')),
        ).toBe(true);
    });

    it('names the enemy in every hunt and dungeon notice (D-32)', () => {
        for (const kind of ['hunt', 'dungeon'] as const) {
            for (const notice of noticesOf(kind)) {
                expect(notice).toContain(NAMES.enemy);
            }
        }
    });

    it('includes the heal notice written by the user (D-32)', () => {
        expect(noticesOf('heal')[0]).toBe(USER_HEAL_NOTICE);
    });
});
