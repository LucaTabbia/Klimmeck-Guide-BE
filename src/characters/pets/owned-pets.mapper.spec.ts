import { Types } from 'mongoose';
import type { OwnedPet } from 'src/models/character/owned-pet.model';
import type { Pet } from 'src/models/pet.model';
import { ownedPetsOnTheWire } from './owned-pets.mapper';

const MINUTE_MS = 60_000;
const RECOVERY_TIME_MS = 100 * MINUTE_MS;
const t0 = new Date('2026-11-14T10:00:00.000Z');
const NOW = new Date('2026-11-14T12:00:00.000Z');

const at = (minutes: number): Date =>
    new Date(t0.getTime() + minutes * MINUTE_MS);

function populated(name: string, fields: Record<string, unknown> = {}): Pet {
    return {
        id: new Types.ObjectId().toHexString(),
        name,
        ...fields,
    } as unknown as Pet;
}

function companion(fields: Record<string, unknown> = {}): Pet {
    return populated('Lupo', {
        maxLifePoints: 100,
        recoveryTime: RECOVERY_TIME_MS,
        ...fields,
    });
}

function entryOf(pet: unknown, xp = 0, currentLifePoints = 10): OwnedPet {
    return { pet, xp, currentLifePoints } as OwnedPet;
}

function onTheWire(
    pet: Pet,
    xp: number,
    currentLifePoints: number,
    fields: Record<string, unknown> = {},
): OwnedPet {
    return {
        pet,
        xp,
        currentLifePoints,
        name: null,
        lifeAsOf: null,
        defeatedUntil: null,
        potionRecoveryUntil: null,
        ...fields,
    } as OwnedPet;
}

function servedOne(
    entry: Record<string, unknown>,
    now: Date,
    equippedPet: unknown = null,
): OwnedPet {
    const [served] = ownedPetsOnTheWire(
        [entry as unknown as OwnedPet],
        equippedPet,
        now,
    );
    return served;
}

describe('owned pets on the wire', () => {
    it('keeps the entries whose pet is populated, in order (D-23)', () => {
        const horse = populated('Cavallo');
        const cat = populated('Gatto');

        expect(
            ownedPetsOnTheWire(
                [entryOf(horse, 12, 80), entryOf(cat)],
                null,
                NOW,
            ),
        ).toEqual([onTheWire(horse, 12, 80), onTheWire(cat, 0, 10)]);
    });

    it('drops the entry whose pet is gone from the catalogue (D-23)', () => {
        const horse = populated('Cavallo');

        expect(
            ownedPetsOnTheWire(
                [
                    entryOf(null),
                    entryOf(horse),
                    entryOf(new Types.ObjectId()),
                    entryOf(undefined),
                ],
                null,
                NOW,
            ),
        ).toEqual([onTheWire(horse, 0, 10)]);
    });

    it('serves the numbers of a broken entry as valid amounts and keeps its pet (D-03, D-23)', () => {
        const horse = populated('Cavallo');
        const cat = populated('Gatto');
        const owl = populated('Gufo');

        expect(
            ownedPetsOnTheWire(
                [
                    entryOf(horse, null as unknown as number, 12.9),
                    { pet: cat, xp: -4 } as unknown as OwnedPet,
                    entryOf(owl, 120.5, Number.NaN),
                ],
                null,
                NOW,
            ),
        ).toEqual([
            onTheWire(horse, 0, 12),
            onTheWire(cat, 0, 1),
            onTheWire(owl, 120, 1),
        ]);
    });

    it('drops a null entry instead of throwing (D-23)', () => {
        const horse = populated('Cavallo');

        expect(
            ownedPetsOnTheWire(
                [null as unknown as OwnedPet, entryOf(horse)],
                null,
                NOW,
            ),
        ).toEqual([onTheWire(horse, 0, 10)]);
    });

    it('reads a missing list as empty (D-23)', () => {
        expect(ownedPetsOnTheWire(undefined, null, NOW)).toEqual([]);
        expect(ownedPetsOnTheWire(null, null, NOW)).toEqual([]);
    });

    it('serves a resting companion with its anchor and rest date (D-04, D-24)', () => {
        const wolf = companion();

        expect(
            servedOne(
                { pet: wolf, xp: 0, currentLifePoints: 20, lifeAsOf: t0 },
                at(20),
            ),
        ).toEqual(onTheWire(wolf, 0, 20, { lifeAsOf: t0 }));
    });

    it('collapses a rest that is already over to full life (D-24)', () => {
        const wolf = companion();

        expect(
            servedOne(
                { pet: wolf, xp: 0, currentLifePoints: 20, lifeAsOf: t0 },
                at(81),
            ),
        ).toEqual(onTheWire(wolf, 0, 100));
    });

    it('serves the equipped companion without a rest date (D-04)', () => {
        const wolf = companion();

        expect(
            servedOne(
                { pet: wolf, xp: 0, currentLifePoints: 20, lifeAsOf: t0 },
                at(20),
                new Types.ObjectId(wolf.id),
            ),
        ).toEqual(onTheWire(wolf, 0, 20));
    });

    it('recognises the equipped companion when the slot is populated (D-04)', () => {
        const wolf = companion();

        expect(
            servedOne(
                { pet: wolf, xp: 0, currentLifePoints: 20, lifeAsOf: t0 },
                at(20),
                { _id: new Types.ObjectId(wolf.id), id: wolf.id },
            ),
        ).toEqual(onTheWire(wolf, 0, 20));
    });

    it('serves a legacy life of zero as full life (D-23)', () => {
        const wolf = companion();

        expect(
            servedOne({ pet: wolf, xp: 0, currentLifePoints: 0 }, at(20)),
        ).toEqual(onTheWire(wolf, 0, 100));
    });

    it('drops a past defeat date and a past potion wait (D-05, D-24)', () => {
        const wolf = companion();
        const base = { pet: wolf, xp: 0, currentLifePoints: 40, level: 1 };

        expect(
            servedOne(
                {
                    ...base,
                    defeatedUntil: at(20),
                    potionRecoveryUntil: at(10),
                },
                at(20),
            ),
        ).toEqual(onTheWire(wolf, 0, 40, { level: 1 }));
        expect(
            servedOne(
                {
                    ...base,
                    defeatedUntil: at(21),
                    potionRecoveryUntil: at(30),
                },
                at(20),
            ),
        ).toEqual(
            onTheWire(wolf, 0, 40, {
                level: 1,
                defeatedUntil: at(21),
                potionRecoveryUntil: at(30),
            }),
        );
    });

    it('serves the name of a named companion and null otherwise (D-18)', () => {
        const wolf = companion();
        const base = { pet: wolf, xp: 0, currentLifePoints: 40, level: 1 };

        expect(servedOne({ ...base, name: 'Fulmine' }, NOW).name).toBe(
            'Fulmine',
        );
        expect(servedOne({ ...base, name: '' }, NOW).name).toBeNull();
        expect(servedOne(base, NOW).name).toBeNull();
    });

    it('collapses the rest at the maximum of the companion level, not at the species base (D-38)', () => {
        const wolf = companion({ maxXp: 100 });

        expect(
            servedOne(
                { pet: wolf, xp: 22, currentLifePoints: 50, lifeAsOf: t0 },
                at(200),
            ),
        ).toEqual(onTheWire(wolf, 22, 122));
    });

    it('keeps the saved level and drops an invalid one (D-39)', () => {
        const wolf = companion({ maxXp: 100 });

        expect(
            servedOne(
                { pet: wolf, xp: 0, currentLifePoints: 40, level: 4 },
                NOW,
            ),
        ).toEqual(onTheWire(wolf, 0, 40, { level: 4 }));
        expect(
            Object.keys(
                servedOne(
                    { pet: wolf, xp: 0, currentLifePoints: 40, level: 11 },
                    NOW,
                ),
            ).sort(),
        ).toEqual([
            'currentLifePoints',
            'defeatedUntil',
            'lifeAsOf',
            'name',
            'pet',
            'potionRecoveryUntil',
            'xp',
        ]);
    });
});
