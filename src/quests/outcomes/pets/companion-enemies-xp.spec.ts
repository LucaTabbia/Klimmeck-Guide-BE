import { InjuryType } from 'src/models/enums/injury-type.enum';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import {
    companionEnemiesXpOf,
    companionFightOf,
    companionShareOf,
} from 'src/quests/outcomes/pets/companion-enemies-xp';

const effectsWith = (
    overrides: Partial<ParticipantEffects> = {},
): ParticipantEffects => ({
    characterId: 'hero',
    hpAfter: 500,
    injuriesAdded: [InjuryType.deepCut],
    consumablesUsed: [],
    spellsUsed: [],
    ...overrides,
});

describe('companionEnemiesXpOf', () => {
    it('leaves the companion all the enemies when there is no fight (D-13)', () => {
        expect(companionEnemiesXpOf([])).toEqual({});
    });

    it('leaves the companion all the enemies when it never falls (D-13)', () => {
        expect(
            companionEnemiesXpOf([
                { enemiesXp: 60, companionLifeAfter: 40 },
                { enemiesXp: 20, companionLifeAfter: 2 },
                { enemiesXp: 20 },
            ]),
        ).toEqual({});
    });

    it('gives the companion nothing of the last fight when it falls there (D-13)', () => {
        expect(
            companionEnemiesXpOf([
                { enemiesXp: 60, companionLifeAfter: 40 },
                { enemiesXp: 20, companionLifeAfter: 1 },
            ]),
        ).toEqual({ companionEnemiesXp: 60 });
    });

    it('counts only the fights the companion leaves standing, not the one where it falls (D-13)', () => {
        expect(
            companionEnemiesXpOf([
                { enemiesXp: 60, companionLifeAfter: 1 },
                { enemiesXp: 20 },
                { enemiesXp: 20 },
            ]),
        ).toEqual({ companionEnemiesXp: 0 });
        expect(
            companionEnemiesXpOf([
                { enemiesXp: 60, companionLifeAfter: 30 },
                { enemiesXp: 20, companionLifeAfter: 1 },
                { enemiesXp: 25 },
            ]),
        ).toEqual({ companionEnemiesXp: 60 });
    });

    it('keeps the share of a merged sequence where the companion fell (D-13)', () => {
        expect(
            companionEnemiesXpOf([
                {
                    enemiesXp: 100,
                    companionLifeAfter: 1,
                    companionEnemiesXp: 40,
                },
                { enemiesXp: 5 },
            ]),
        ).toEqual({ companionEnemiesXp: 40 });
        expect(
            companionEnemiesXpOf([
                { enemiesXp: 100, companionLifeAfter: 30 },
                { enemiesXp: 5, companionLifeAfter: 1 },
            ]),
        ).toEqual({ companionEnemiesXp: 100 });
    });
});

describe('companionFightOf', () => {
    it('keeps only the companion keys of the effects (D-13)', () => {
        expect(companionFightOf(null, 30)).toEqual({ enemiesXp: 30 });
        expect(companionFightOf(effectsWith(), 30)).toEqual({ enemiesXp: 30 });
        expect(
            companionFightOf(
                effectsWith({ companionLifeAfter: 1, companionEnemiesXp: 12 }),
                30,
            ),
        ).toEqual({
            enemiesXp: 30,
            companionLifeAfter: 1,
            companionEnemiesXp: 12,
        });
    });
});

describe('companionShareOf', () => {
    it('gives the companion all the enemies of a single fight it leaves standing (D-13)', () => {
        expect(companionShareOf(null, 30)).toBe(30);
        expect(companionShareOf(effectsWith(), 30)).toBe(30);
        expect(
            companionShareOf(effectsWith({ companionLifeAfter: 2 }), 30),
        ).toBe(30);
    });

    it('gives nothing to a companion fallen in a single fight (D-13)', () => {
        expect(
            companionShareOf(effectsWith({ companionLifeAfter: 1 }), 30),
        ).toBe(0);
    });

    it('gives a companion fallen in a sequence the share of the sequence (D-13)', () => {
        expect(
            companionShareOf(
                effectsWith({ companionLifeAfter: 1, companionEnemiesXp: 12 }),
                30,
            ),
        ).toBe(12);
    });
});
