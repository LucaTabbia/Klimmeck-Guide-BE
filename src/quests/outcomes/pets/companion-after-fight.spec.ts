import { Types } from 'mongoose';
import type { OwnedPetEntry } from 'src/characters/pets/owned-pet-entry';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import {
    companionAfterFight,
    type CompanionCatalogEntry,
    type CompanionFightInput,
} from 'src/quests/outcomes/pets/companion-after-fight';
import { petXpAward } from 'src/quests/outcomes/pets/pet-xp';

const worg = new Types.ObjectId();
const hawk = new Types.ObjectId();

const t0 = new Date('2026-11-14T10:00:00.000Z');
const RECOVERY_MS = 60 * 60 * 1000;
const backAt = new Date(t0.getTime() + RECOVERY_MS);

const WORG: CompanionCatalogEntry = {
    name: 'Worg',
    maxLifePoints: 100,
    recoveryTime: RECOVERY_MS,
};
const LEVELLED_WORG: CompanionCatalogEntry = { ...WORG, maxXp: 100 };

const fenrir = (overrides: Partial<OwnedPetEntry> = {}): OwnedPetEntry => ({
    pet: worg,
    xp: 0,
    currentLifePoints: 60,
    level: 1,
    name: 'Fenrir',
    ...overrides,
});

const effectsWith = (
    companion: Partial<Pick<ParticipantEffects, 'companionLifeAfter'>> = {},
): ParticipantEffects => ({
    characterId: new Types.ObjectId().toHexString(),
    hpAfter: 10,
    injuriesAdded: [],
    consumablesUsed: [],
    spellsUsed: [],
    ...companion,
});

const fightOf = (
    overrides: Partial<CompanionFightInput> & {
        entry?: OwnedPetEntry;
        catalog?: CompanionCatalogEntry;
        lifeAfter?: number;
    } = {},
): CompanionFightInput => {
    const { entry, catalog, lifeAfter, ...input } = overrides;
    const facts = catalog ?? WORG;
    return {
        assets: { pet: worg, ownedPets: [entry ?? fenrir()] },
        effects: effectsWith(
            lifeAfter === undefined ? {} : { companionLifeAfter: lifeAfter },
        ),
        enemiesXp: 0,
        petMaxXp: new Map(
            typeof facts.maxXp === 'number'
                ? [[worg.toHexString(), facts.maxXp]]
                : [],
        ),
        petCatalog: new Map([[worg.toHexString(), facts]]),
        at: t0,
        ...input,
    };
};

describe('companionAfterFight', () => {
    it('writes the life after the fight and keeps the companion in the slot (D-03, D-10)', () => {
        const after = companionAfterFight(fightOf({ lifeAfter: 35 }));

        expect(after.unequip).toBe(false);
        expect(after.ownedPets).toEqual([
            {
                pet: worg,
                xp: 0,
                currentLifePoints: 35,
                level: 1,
                name: 'Fenrir',
            },
        ]);
        expect(after.outcome).toEqual({
            name: 'Fenrir',
            lifeBefore: 60,
            lifePoints: 35,
            maxLifePoints: 100,
            defeated: false,
            fullLifeAt: null,
        });
    });

    it('defeats a companion that ends the fight at 1 and sends it to rest (D-03, D-26)', () => {
        const after = companionAfterFight(fightOf({ lifeAfter: 1 }));

        expect(after.unequip).toBe(true);
        expect(after.ownedPets).toEqual([
            {
                pet: worg,
                xp: 0,
                currentLifePoints: 1,
                level: 1,
                name: 'Fenrir',
                lifeAsOf: t0,
                defeatedUntil: backAt,
            },
        ]);
        expect(after.outcome?.defeated).toBe(true);
        expect(after.outcome?.fullLifeAt).toEqual(backAt);
    });

    it('defeats a companion that entered at 1 and stayed at 1 (D-26)', () => {
        const after = companionAfterFight(
            fightOf({ entry: fenrir({ currentLifePoints: 1 }), lifeAfter: 1 }),
        );

        expect(after.unequip).toBe(true);
        expect(after.outcome).toEqual({
            name: 'Fenrir',
            lifeBefore: 1,
            lifePoints: 1,
            maxLifePoints: 100,
            defeated: true,
            fullLifeAt: backAt,
        });
    });

    it('clamps an engine value outside the life range (D-03)', () => {
        const low = companionAfterFight(fightOf({ lifeAfter: 0 }));
        const high = companionAfterFight(fightOf({ lifeAfter: 500 }));

        expect(low.outcome?.lifePoints).toBe(1);
        expect(low.outcome?.defeated).toBe(true);
        expect(low.unequip).toBe(true);
        expect(high.outcome?.lifePoints).toBe(100);
        expect(high.outcome?.defeated).toBe(false);
        expect(high.ownedPets?.[0].currentLifePoints).toBe(100);
    });

    it('serves the companion outcome whenever the companion fought, unharmed too (D-27)', () => {
        const after = companionAfterFight(fightOf({ lifeAfter: 60 }));

        expect(after).toEqual({
            ownedPets: null,
            unequip: false,
            outcome: {
                name: 'Fenrir',
                lifeBefore: 60,
                lifePoints: 60,
                maxLifePoints: 100,
                defeated: false,
                fullLifeAt: null,
            },
            gained: 0,
        });
    });

    it('keeps the life unchanged without companionLifeAfter, as in the legacy completion (D-27)', () => {
        const after = companionAfterFight(fightOf());

        expect(after.unequip).toBe(false);
        expect(after.outcome).toEqual({
            name: 'Fenrir',
            lifeBefore: 60,
            lifePoints: 60,
            maxLifePoints: 100,
            defeated: false,
            fullLifeAt: null,
        });
    });

    it('tells nothing without a fight or without a companion (D-27)', () => {
        const noFight = companionAfterFight(fightOf({ effects: null }));
        const noCompanion = companionAfterFight(
            fightOf({
                assets: { pet: null, ownedPets: [fenrir()] },
                lifeAfter: 1,
            }),
        );

        expect(noFight).toEqual({
            ownedPets: null,
            unequip: false,
            outcome: null,
            gained: 0,
        });
        expect(noCompanion).toEqual({
            ownedPets: null,
            unequip: false,
            outcome: null,
            gained: 0,
        });
    });

    it('awards only the xp without a fight, with the level of the new xp (D-27, D-39)', () => {
        const after = companionAfterFight(
            fightOf({
                effects: null,
                catalog: LEVELLED_WORG,
                entry: fenrir({ xp: 60, level: 7, currentLifePoints: 140 }),
                enemiesXp: 50,
            }),
        );

        expect(after).toEqual({
            ownedPets: [
                {
                    pet: worg,
                    xp: 65,
                    currentLifePoints: 140,
                    level: 8,
                    name: 'Fenrir',
                },
            ],
            unequip: false,
            outcome: null,
            gained: 5,
        });
    });

    it('uses the species when the companion has no name (D-20)', () => {
        const entry = fenrir();
        delete entry.name;

        const after = companionAfterFight(fightOf({ entry, lifeAfter: 35 }));

        expect(after.outcome?.name).toBe('Worg');
    });

    it('awards the companion xp in the same array as its life (D-10)', () => {
        const after = companionAfterFight(
            fightOf({ catalog: LEVELLED_WORG, lifeAfter: 35, enemiesXp: 30 }),
        );

        expect(after.gained).toBe(petXpAward(30, 0, 100).gained);
        expect(after.gained).toBe(3);
        expect(after.ownedPets).toEqual([
            {
                pet: worg,
                xp: 3,
                currentLifePoints: 35,
                level: 2,
                name: 'Fenrir',
            },
        ]);
    });

    it('sends a pet without a curated recovery time out of the slot with no defeat date (D-25, D-26)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: { ...WORG, recoveryTime: null },
                lifeAfter: 1,
            }),
        );

        expect(after.unequip).toBe(true);
        expect(after.ownedPets).toEqual([
            {
                pet: worg,
                xp: 0,
                currentLifePoints: 1,
                level: 1,
                name: 'Fenrir',
                lifeAsOf: t0,
            },
        ]);
        expect(after.outcome?.defeated).toBe(true);
        expect(after.outcome?.fullLifeAt).toBeNull();
    });

    it('keeps the name and dates of the other companions (D-23)', () => {
        const restingSince = new Date('2026-11-13T08:00:00.000Z');
        const potionUntil = new Date('2026-11-14T12:00:00.000Z');
        const resting = {
            pet: hawk,
            xp: 4,
            currentLifePoints: 7,
            level: 2,
            name: 'Ali',
            lifeAsOf: restingSince,
            defeatedUntil: potionUntil,
            potionRecoveryUntil: potionUntil,
        };

        const after = companionAfterFight(
            fightOf({
                assets: { pet: worg, ownedPets: [resting, fenrir()] },
                lifeAfter: 35,
            }),
        );

        expect(after.ownedPets).toEqual([
            resting,
            {
                pet: worg,
                xp: 0,
                currentLifePoints: 35,
                level: 1,
                name: 'Fenrir',
            },
        ]);
    });

    it('reads the maximum again after the xp of the fight without touching the life (D-37)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: LEVELLED_WORG,
                entry: fenrir({ xp: 60, level: 7, currentLifePoints: 147 }),
                lifeAfter: 147,
                enemiesXp: 50,
            }),
        );

        expect(after.ownedPets).toEqual([
            {
                pet: worg,
                xp: 65,
                currentLifePoints: 147,
                level: 8,
                name: 'Fenrir',
            },
        ]);
        expect(after.outcome?.maxLifePoints).toBe(162);
        expect(after.outcome?.lifePoints).toBe(147);
    });

    it('writes the level with the xp and keeps it when the xp does not change (D-39)', () => {
        const kept = companionAfterFight(
            fightOf({
                catalog: LEVELLED_WORG,
                entry: fenrir({ xp: 0, level: 4, currentLifePoints: 60 }),
                lifeAfter: 50,
            }),
        );
        const recalculated = companionAfterFight(
            fightOf({
                catalog: LEVELLED_WORG,
                entry: fenrir({ xp: 0, level: 4, currentLifePoints: 60 }),
                lifeAfter: 50,
                enemiesXp: 30,
            }),
        );

        expect(kept.ownedPets?.[0].level).toBe(4);
        expect(recalculated.ownedPets?.[0].level).toBe(2);
        expect(recalculated.ownedPets?.[0].xp).toBe(3);
    });

    it('writes the level and the full life of a companion never touched by the phase after its first fight (D-23, D-38)', () => {
        const legacy: OwnedPetEntry = {
            pet: worg,
            xp: 22,
            currentLifePoints: 100,
        };

        const after = companionAfterFight(
            fightOf({ catalog: LEVELLED_WORG, entry: legacy }),
        );

        expect(after.ownedPets).toEqual([
            { pet: worg, xp: 22, currentLifePoints: 122, level: 5 },
        ]);
        expect(after.outcome?.lifeBefore).toBe(122);
        expect(after.outcome?.name).toBe('Worg');
    });

    it('keeps the life of a companion that levels up in its fight (D-37)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: LEVELLED_WORG,
                entry: fenrir({ xp: 60, level: 7, currentLifePoints: 147 }),
                enemiesXp: 50,
            }),
        );

        expect(after.ownedPets?.[0]).toEqual(
            expect.objectContaining({ currentLifePoints: 147, level: 8 }),
        );
        expect(after.outcome).toEqual(
            expect.objectContaining({
                lifeBefore: 147,
                lifePoints: 147,
                maxLifePoints: 162,
            }),
        );
    });

    it('clamps the fight life to the maximum of the starting level (D-38)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: LEVELLED_WORG,
                entry: fenrir({ xp: 60, level: 7, currentLifePoints: 100 }),
                lifeAfter: 500,
                enemiesXp: 50,
            }),
        );

        expect(after.outcome?.lifePoints).toBe(147);
        expect(after.ownedPets?.[0].currentLifePoints).toBe(147);
    });

    it('awards only the xp for a pet without a valid base life (D-37)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: { ...LEVELLED_WORG, maxLifePoints: null },
                entry: fenrir({ xp: 60, level: 7, currentLifePoints: 140 }),
                lifeAfter: 1,
                enemiesXp: 50,
            }),
        );

        expect(after).toEqual({
            ownedPets: [
                {
                    pet: worg,
                    xp: 65,
                    currentLifePoints: 140,
                    level: 8,
                    name: 'Fenrir',
                },
            ],
            unequip: false,
            outcome: null,
            gained: 5,
        });
    });
});

describe('the companion xp after a fight (ex companion-xp, D-39)', () => {
    const capped = (maxXp: number): CompanionCatalogEntry => ({
        ...WORG,
        maxXp,
    });

    it('caps the gain of the companion at the catalogue maximum (D-04)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: capped(100),
                entry: fenrir({ xp: 95, level: 9 }),
                enemiesXp: 500,
            }),
        );

        expect(after.gained).toBe(5);
        expect(after.ownedPets?.[0]).toEqual(
            expect.objectContaining({ xp: 100, level: 10 }),
        );
    });

    it('changes nothing when the companion is already at its cap (D-17)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: capped(100),
                entry: fenrir({ xp: 100, level: 10 }),
                enemiesXp: 500,
            }),
        );

        expect(after.gained).toBe(0);
        expect(after.ownedPets).toBeNull();
    });

    it('awards no xp when the catalogue has no valid cap for the companion (D-17)', () => {
        const after = companionAfterFight(fightOf({ enemiesXp: 130 }));

        expect(after.gained).toBe(0);
        expect(after.ownedPets).toBeNull();
    });

    it('changes nothing when the equipped companion has no entry (D-04)', () => {
        const after = companionAfterFight(
            fightOf({
                assets: {
                    pet: hawk,
                    ownedPets: [fenrir()],
                },
                lifeAfter: 1,
                enemiesXp: 130,
            }),
        );

        expect(after).toEqual({
            ownedPets: null,
            unequip: false,
            outcome: null,
            gained: 0,
        });
    });

    it('finds the companion stored as a legacy string reference (D-04)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: capped(1000),
                assets: {
                    pet: worg.toHexString(),
                    ownedPets: [
                        { ...fenrir({ xp: 40 }), pet: worg.toHexString() },
                    ] as never,
                },
                enemiesXp: 130,
            }),
        );

        expect(after.gained).toBe(13);
        expect(after.ownedPets?.[0]).toEqual(
            expect.objectContaining({ pet: worg, xp: 53 }),
        );
    });

    it('heals the broken entries of the list it rewrites and leaves out an unreadable one (D-03)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: capped(1000),
                assets: {
                    pet: worg,
                    ownedPets: [
                        { pet: 'not-an-id', xp: 1, currentLifePoints: 1 },
                        { pet: hawk, xp: null, currentLifePoints: 12.5 },
                        fenrir({ xp: 40 }),
                    ] as never,
                },
                enemiesXp: 130,
            }),
        );

        expect(after.ownedPets).toEqual([
            { pet: hawk, xp: 0, currentLifePoints: 12 },
            expect.objectContaining({ pet: worg, xp: 53 }),
        ]);
    });

    it('floors a fractional stored experience and never writes below its integer part (D-04)', () => {
        const after = companionAfterFight(
            fightOf({
                catalog: capped(1000),
                entry: fenrir({ xp: 120.5 }),
                enemiesXp: 40,
            }),
        );

        expect(after.gained).toBe(4);
        expect(after.ownedPets?.[0].xp).toBe(124);
    });
});
