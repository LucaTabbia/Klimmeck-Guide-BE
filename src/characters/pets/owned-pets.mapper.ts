import { Types } from 'mongoose';
import type { OwnedPet } from 'src/models/character/owned-pet.model';
import type { Pet } from 'src/models/pet.model';
import { refIdOf, sameId } from 'src/mongo/document-id';
import { companionLifeAt, companionStoredLifeOf } from './companion-life';
import { companionMaxLifeOf, isSavedCompanionLevel } from './companion-level';
import { ownedPetCountOf } from './owned-pet-entry';

// populate lascia null (o il ref nudo) il pet tolto dal catalogo: solo un oggetto con id stringa è un pet servibile
function isPopulated(pet: unknown): boolean {
    return typeof (pet as { id?: unknown } | null | undefined)?.id === 'string';
}

// lo slot arriva come ref nudo o come pet popolato: entrambi si leggono come id del catalogo
function petIdOf(value: unknown): Types.ObjectId | null {
    const ref = refIdOf(value);
    if (ref) return ref;
    const pet = value as { _id?: unknown; id?: unknown } | null | undefined;
    return refIdOf(pet?._id) ?? refIdOf(pet?.id);
}

const isFutureDate = (value: unknown, now: Date): value is Date =>
    value instanceof Date && value.getTime() > now.getTime();

const futureDateOrNull = (value: unknown, now: Date): Date | null =>
    isFutureDate(value, now) ? value : null;

const nameOrNull = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

function isEquipped(pet: unknown, equippedId: Types.ObjectId | null): boolean {
    return equippedId !== null && sameId(petIdOf(pet), equippedId);
}

// solo chiavi dello schema (findOne idrata l'array): riposo concluso collassato a vita piena, date passate azzerate (D-04, D-23, D-24, D-38)
function onTheWire(
    entry: OwnedPet,
    equippedId: Types.ObjectId | null,
    now: Date,
): OwnedPet {
    const pet = entry.pet as Pet;
    const maxLifePoints = companionMaxLifeOf(entry, pet);
    const storedLife = companionStoredLifeOf(entry, maxLifePoints);
    const life = companionLifeAt({
        lifePoints: storedLife,
        lifeAsOf: entry.lifeAsOf,
        resting: !isEquipped(pet, equippedId),
        maxLifePoints,
        recoveryTimeMs: pet.recoveryTime,
        now,
    });
    const resting = life.fullLifeAt !== null;
    return {
        pet: entry.pet,
        xp: ownedPetCountOf(entry.xp),
        currentLifePoints: resting ? storedLife : life.lifePoints,
        name: nameOrNull(entry.name),
        lifeAsOf: resting ? (entry.lifeAsOf ?? null) : null,
        defeatedUntil: futureDateOrNull(entry.defeatedUntil, now),
        potionRecoveryUntil: futureDateOrNull(entry.potionRecoveryUntil, now),
        ...(isSavedCompanionLevel(entry.level) ? { level: entry.level } : {}),
    };
}

// sul filo (Phase 19 D-23): una voce non servibile annullerebbe assets e il personaggio; la voce orfana o senza ref leggibile resta a DB
export function ownedPetsOnTheWire(
    entries: readonly OwnedPet[] | null | undefined,
    equippedPet: unknown,
    now: Date,
): OwnedPet[] {
    const equippedId = petIdOf(equippedPet);
    return (entries ?? [])
        .filter((entry) => isPopulated(entry?.pet))
        .map((entry) => onTheWire(entry, equippedId, now));
}
