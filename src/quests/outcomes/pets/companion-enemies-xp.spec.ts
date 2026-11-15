import { companionEnemiesXpOf } from 'src/quests/outcomes/pets/companion-enemies-xp';

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

    it('leaves the companion all the enemies when it falls in the last fight (D-13)', () => {
        expect(
            companionEnemiesXpOf([
                { enemiesXp: 60, companionLifeAfter: 40 },
                { enemiesXp: 20, companionLifeAfter: 1 },
            ]),
        ).toEqual({});
    });

    it('counts the fights up to the one where the companion falls, that one included (D-13)', () => {
        expect(
            companionEnemiesXpOf([
                { enemiesXp: 60, companionLifeAfter: 1 },
                { enemiesXp: 20 },
                { enemiesXp: 20 },
            ]),
        ).toEqual({ companionEnemiesXp: 60 });
        expect(
            companionEnemiesXpOf([
                { enemiesXp: 60, companionLifeAfter: 30 },
                { enemiesXp: 20, companionLifeAfter: 1 },
                { enemiesXp: 25 },
            ]),
        ).toEqual({ companionEnemiesXp: 80 });
    });
});
