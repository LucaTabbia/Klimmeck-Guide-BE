import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { idForms } from 'src/mongo/document-id';
import type { OwnedPetEntry } from './owned-pet-entry';
import {
    type PetCatalogFacts,
    type PetSlotPlan,
    type PetSlotSnapshot,
    planEquipPet,
    planUnequipPet,
} from './equip-pet.plan';

const MINUTE_MS = 60_000;
const T = 100 * MINUTE_MS;
const t0 = new Date('2026-11-14T10:00:00.000Z');

const at = (minutes: number): Date =>
    new Date(t0.getTime() + minutes * MINUTE_MS);

const characterId = new Types.ObjectId();
const X = new Types.ObjectId();
const Y = new Types.ObjectId();
const Z = new Types.ObjectId();

const catalog = new Map<string, PetCatalogFacts>([
    [X.toHexString(), { maxLifePoints: 100, maxXp: 100, recoveryTime: T }],
    [Y.toHexString(), { maxLifePoints: 100, maxXp: 100, recoveryTime: T }],
    [Z.toHexString(), { maxLifePoints: 100, maxXp: 100, recoveryTime: T }],
]);

function snapshotOf(
    slot: Types.ObjectId | null,
    ownedPets: OwnedPetEntry[],
): PetSlotSnapshot {
    return { _id: characterId, assets: { pet: slot, ownedPets } };
}

function writtenEntries(plan: PetSlotPlan): unknown[] {
    return plan.update?.$set['assets.ownedPets'] as unknown[];
}

function writtenEntryOf(plan: PetSlotPlan, petId: Types.ObjectId): unknown {
    return writtenEntries(plan).find((entry) =>
        petId.equals((entry as { pet: Types.ObjectId }).pet),
    );
}

function refusalOf(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return (error as { code?: unknown }).code;
    }
    return undefined;
}

describe('planEquipPet', () => {
    it('equips a hurt resting companion with the life it reached (D-04)', () => {
        const plan = planEquipPet({
            snapshot: snapshotOf(null, [
                { pet: X, xp: 0, currentLifePoints: 20, lifeAsOf: t0 },
            ]),
            petId: X,
            catalog,
            now: at(20),
        });

        expect(plan.update?.$set['assets.pet']).toBe(X);
        expect(writtenEntries(plan)).toEqual([
            { pet: X, xp: 0, currentLifePoints: 40, level: 1 },
        ]);
    });

    it('refuses a defeated companion before its full-life date (D-02, D-24)', () => {
        const now = at(50);

        const code = refusalOf(() =>
            planEquipPet({
                snapshot: snapshotOf(null, [
                    {
                        pet: X,
                        xp: 0,
                        currentLifePoints: 1,
                        lifeAsOf: at(0),
                        defeatedUntil: new Date(now.getTime() + 1),
                        level: 1,
                    },
                ]),
                petId: X,
                catalog,
                now,
            }),
        );

        expect(code).toBe(GameRuleErrorCode.PET_DEFEATED);
    });

    it('equips after the full-life date without clearing the defeat marker (D-24)', () => {
        const now = at(200);
        const defeatedUntil = new Date(now.getTime() - 1);

        const plan = planEquipPet({
            snapshot: snapshotOf(null, [
                {
                    pet: X,
                    xp: 0,
                    currentLifePoints: 1,
                    lifeAsOf: new Date(now.getTime() - T),
                    defeatedUntil,
                    level: 1,
                },
            ]),
            petId: X,
            catalog,
            now,
        });

        expect(writtenEntryOf(plan, X)).toEqual({
            pet: X,
            xp: 0,
            currentLifePoints: 100,
            defeatedUntil,
            level: 1,
        });
    });

    it('puts the outgoing companion to rest from now (D-04)', () => {
        const now = at(30);

        const plan = planEquipPet({
            snapshot: snapshotOf(Y, [
                { pet: X, xp: 0, currentLifePoints: 100, level: 1 },
                { pet: Y, xp: 0, currentLifePoints: 30, level: 1 },
            ]),
            petId: X,
            catalog,
            now,
        });

        expect(plan.update?.$set['assets.pet']).toBe(X);
        expect(writtenEntryOf(plan, Y)).toEqual({
            pet: Y,
            xp: 0,
            currentLifePoints: 30,
            lifeAsOf: now,
            level: 1,
        });
    });

    it('refuses a pet not owned before judging the defeat (D-02)', () => {
        const code = refusalOf(() =>
            planEquipPet({
                snapshot: snapshotOf(null, [
                    {
                        pet: Y,
                        xp: 0,
                        currentLifePoints: 1,
                        defeatedUntil: at(100),
                        level: 1,
                    },
                ]),
                petId: X,
                catalog,
                now: t0,
            }),
        );

        expect(code).toBe(GameRuleErrorCode.PET_NOT_OWNED);
    });

    it('writes nothing when the companion is already equipped (D-04)', () => {
        const plan = planEquipPet({
            snapshot: snapshotOf(X, [
                { pet: X, xp: 0, currentLifePoints: 40, level: 1 },
            ]),
            petId: X,
            catalog,
            now: t0,
        });

        expect(plan.update).toBeNull();
    });

    it('guards the write on the slot as read (D-23)', () => {
        const owned: OwnedPetEntry[] = [
            { pet: X, xp: 0, currentLifePoints: 100, level: 1 },
            { pet: Y, xp: 0, currentLifePoints: 100, level: 1 },
        ];

        const fromEmpty = planEquipPet({
            snapshot: snapshotOf(null, owned),
            petId: X,
            catalog,
            now: t0,
        });
        const fromY = planEquipPet({
            snapshot: snapshotOf(Y, owned),
            petId: X,
            catalog,
            now: t0,
        });

        expect(fromEmpty.filter).toEqual({
            _id: characterId,
            deletedAt: null,
            'assets.pet': null,
        });
        expect(fromY.filter).toEqual({
            _id: characterId,
            deletedAt: null,
            'assets.pet': { $in: idForms(Y) },
        });
    });

    it('keeps the name, dates and level of every companion (D-23, D-39)', () => {
        const now = at(10);
        const third: OwnedPetEntry = {
            pet: Z,
            xp: 5,
            currentLifePoints: 50,
            name: 'Ombra',
            lifeAsOf: t0,
            potionRecoveryUntil: at(60),
            level: 3,
        };

        const plan = planEquipPet({
            snapshot: snapshotOf(Y, [
                {
                    pet: X,
                    xp: 0,
                    currentLifePoints: 100,
                    name: 'Zanna',
                    level: 1,
                },
                {
                    pet: Y,
                    xp: 0,
                    currentLifePoints: 70,
                    name: 'Brina',
                    level: 1,
                },
                third,
            ]),
            petId: X,
            catalog,
            now,
        });

        expect(writtenEntryOf(plan, Z)).toEqual(third);
        expect(writtenEntryOf(plan, X)).toMatchObject({ name: 'Zanna' });
        expect(writtenEntryOf(plan, Y)).toMatchObject({ name: 'Brina' });
    });

    it('equips a companion never touched by the phase at full life and writes its level (D-23, D-38)', () => {
        const plan = planEquipPet({
            snapshot: snapshotOf(null, [
                { pet: X, xp: 22, currentLifePoints: 100 },
            ]),
            petId: X,
            catalog,
            now: t0,
        });

        expect(writtenEntryOf(plan, X)).toEqual({
            pet: X,
            xp: 22,
            currentLifePoints: 122,
            level: 5,
        });
    });

    it('equips a resting companion with the life reached towards the maximum of its level (D-38)', () => {
        const plan = planEquipPet({
            snapshot: snapshotOf(null, [
                { pet: X, xp: 100, currentLifePoints: 101, lifeAsOf: t0 },
            ]),
            petId: X,
            catalog,
            now: at(25),
        });

        expect(writtenEntryOf(plan, X)).toEqual({
            pet: X,
            xp: 100,
            currentLifePoints: 101 + Math.round((25 * 199) / 100),
            level: 10,
        });
    });
});

describe('planUnequipPet', () => {
    it('puts a legacy companion to rest at full life with its level (D-23, D-38)', () => {
        const now = at(5);

        const plan = planUnequipPet({
            snapshot: snapshotOf(Y, [
                { pet: Y, xp: 22, currentLifePoints: 100 },
            ]),
            catalog,
            now,
        });

        expect(writtenEntryOf(plan, Y)).toEqual({
            pet: Y,
            xp: 22,
            currentLifePoints: 122,
            lifeAsOf: now,
            level: 5,
        });
    });

    it('unequip anchors the rest at now and empties the slot (D-04)', () => {
        const now = at(15);
        const other: OwnedPetEntry = {
            pet: X,
            xp: 0,
            currentLifePoints: 60,
            lifeAsOf: t0,
            level: 1,
        };

        const plan = planUnequipPet({
            snapshot: snapshotOf(Y, [
                other,
                { pet: Y, xp: 0, currentLifePoints: 45, level: 1 },
            ]),
            catalog,
            now,
        });

        expect(plan.filter).toEqual({
            _id: characterId,
            deletedAt: null,
            'assets.pet': { $in: idForms(Y) },
        });
        expect(plan.update?.$set['assets.pet']).toBeNull();
        expect(writtenEntries(plan)).toEqual([
            other,
            { pet: Y, xp: 0, currentLifePoints: 45, lifeAsOf: now, level: 1 },
        ]);
    });

    it('unequip writes nothing with an empty slot (D-04)', () => {
        const plan = planUnequipPet({
            snapshot: snapshotOf(null, [
                { pet: X, xp: 0, currentLifePoints: 60, level: 1 },
            ]),
            catalog,
            now: t0,
        });

        expect(plan.update).toBeNull();
    });
});
