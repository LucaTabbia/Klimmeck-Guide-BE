// equip e riposo assestano l'ancora (D-04, D-24): una regola, companion-life.ts; il marcatore della sconfitta lo azzera solo lo sweeper (Pitfall 6)
import type { Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { idForms, refIdOf, sameId } from 'src/mongo/document-id';
import {
    companionLifeAt,
    companionStoredLifeOf,
    isPetDefeated,
} from './companion-life';
import { companionMaxLifeOf, companionStoredLevelOf } from './companion-level';
import {
    type NewOwnedPetEntry,
    type OwnedPetEntry,
    normalisedOwnedPets,
} from './owned-pet-entry';

export interface PetCatalogFacts {
    maxLifePoints?: unknown;
    maxXp?: unknown;
    recoveryTime?: unknown;
}

export interface PetSlotSnapshot {
    _id: Types.ObjectId;
    assets?: {
        pet?: unknown;
        ownedPets?: readonly OwnedPetEntry[] | null;
    } | null;
}

export interface PetSlotPlan {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown> } | null;
}

export const PET_SLOT_PROJECTION = {
    'assets.pet': 1,
    'assets.ownedPets': 1,
} as const;

type PetCatalog = ReadonlyMap<string, PetCatalogFacts>;

interface EquipPetInput {
    snapshot: PetSlotSnapshot;
    petId: Types.ObjectId;
    catalog: PetCatalog;
    now: Date;
}

interface UnequipPetInput {
    snapshot: PetSlotSnapshot;
    catalog: PetCatalog;
    now: Date;
}

interface RenamePetInput {
    snapshot: PetSlotSnapshot;
    petId: Types.ObjectId;
    name: string | null;
    catalog: PetCatalog;
}

const factsOf = (
    catalog: PetCatalog,
    petId: Types.ObjectId,
): PetCatalogFacts | undefined => catalog.get(petId.toHexString());

// la guardia sullo slot letto rende la scrittura condizionale anche fuori dalla transazione (D-23); null corrisponde anche al campo assente
// lo slot come letto: ref nelle due forme salvate, null o il valore illeggibile stesso
export function petSlotGuardOf(slot: unknown): unknown {
    const slotId = refIdOf(slot);
    if (slotId) return { $in: idForms(slotId) };
    return slot ?? null;
}

function slotFilterOf(snapshot: PetSlotSnapshot): Record<string, unknown> {
    return {
        ...activeCharacterById(snapshot._id),
        'assets.pet': petSlotGuardOf(snapshot.assets?.pet),
    };
}

// voce toccata: livello scritto e vita letta con la regola della voce legacy, così dopo questa scrittura non è più legacy (D-23, D-38, D-39)
function settledFields(entry: NewOwnedPetEntry, facts?: PetCatalogFacts) {
    const maxLifePoints = companionMaxLifeOf(entry, facts);
    return {
        maxLifePoints,
        storedLife: companionStoredLifeOf(entry, maxLifePoints),
        level: companionStoredLevelOf(entry, facts),
    };
}

// entra nello slot con la vita raggiunta a riposo; l'equipaggiato non ha ancora (D-04)
function equippedEntry(
    entry: NewOwnedPetEntry,
    facts: PetCatalogFacts | undefined,
    now: Date,
): NewOwnedPetEntry {
    const { maxLifePoints, storedLife, level } = settledFields(entry, facts);
    const { lifePoints } = companionLifeAt({
        lifePoints: storedLife,
        lifeAsOf: entry.lifeAsOf,
        resting: true,
        maxLifePoints,
        recoveryTimeMs: facts?.recoveryTime,
        now,
    });
    const settled: NewOwnedPetEntry = {
        ...entry,
        currentLifePoints: lifePoints,
        level,
    };
    delete settled.lifeAsOf;
    return settled;
}

// esce dallo slot e riposa da adesso con la vita che aveva (D-04)
function restingEntry(
    entry: NewOwnedPetEntry,
    facts: PetCatalogFacts | undefined,
    now: Date,
): NewOwnedPetEntry {
    const { storedLife, level } = settledFields(entry, facts);
    return { ...entry, currentLifePoints: storedLife, lifeAsOf: now, level };
}

function slotUpdate(
    slot: Types.ObjectId | null,
    ownedPets: NewOwnedPetEntry[],
): PetSlotPlan['update'] {
    return { $set: { 'assets.pet': slot, 'assets.ownedPets': ownedPets } };
}

export function planEquipPet(input: EquipPetInput): PetSlotPlan {
    const { snapshot, petId, catalog, now } = input;
    const entries = snapshot.assets?.ownedPets ?? [];
    const chosen = entries.find((entry) => sameId(entry?.pet, petId));
    if (!chosen) throw GameRuleException.petNotOwned();
    if (isPetDefeated(chosen, now)) throw GameRuleException.petDefeated();
    const filter = slotFilterOf(snapshot);
    const outgoing = refIdOf(snapshot.assets?.pet);
    if (outgoing?.equals(petId)) return { filter, update: null };
    const ownedPets = normalisedOwnedPets(entries).map((entry) => {
        if (entry.pet.equals(petId)) {
            return equippedEntry(entry, factsOf(catalog, petId), now);
        }
        if (outgoing?.equals(entry.pet)) {
            return restingEntry(entry, factsOf(catalog, outgoing), now);
        }
        return entry;
    });
    return { filter, update: slotUpdate(petId, ownedPets) };
}

export function planUnequipPet(input: UnequipPetInput): PetSlotPlan {
    const { snapshot, catalog, now } = input;
    const filter = slotFilterOf(snapshot);
    if (snapshot.assets?.pet == null) return { filter, update: null };
    const outgoing = refIdOf(snapshot.assets.pet);
    const ownedPets = normalisedOwnedPets(snapshot.assets?.ownedPets).map(
        (entry) =>
            outgoing?.equals(entry.pet)
                ? restingEntry(entry, factsOf(catalog, outgoing), now)
                : entry,
    );
    return { filter, update: slotUpdate(null, ownedPets) };
}

// il nome cambia solo la voce scelta, senza toccare slot, ancora né sconfitta; null toglie la chiave (D-19, D-31)
function renamedEntry(
    entry: NewOwnedPetEntry,
    facts: PetCatalogFacts | undefined,
    name: string | null,
): NewOwnedPetEntry {
    const { storedLife, level } = settledFields(entry, facts);
    const renamed: NewOwnedPetEntry = {
        ...entry,
        currentLifePoints: storedLife,
        level,
    };
    if (name === null) delete renamed.name;
    else renamed.name = name;
    return renamed;
}

export function planRenamePet(input: RenamePetInput): PetSlotPlan {
    const { snapshot, petId, name, catalog } = input;
    const entries = snapshot.assets?.ownedPets ?? [];
    if (!entries.some((entry) => sameId(entry?.pet, petId))) {
        throw GameRuleException.petNotOwned();
    }
    const ownedPets = normalisedOwnedPets(entries).map((entry) =>
        entry.pet.equals(petId)
            ? renamedEntry(entry, factsOf(catalog, petId), name)
            : entry,
    );
    return {
        filter: slotFilterOf(snapshot),
        update: { $set: { 'assets.ownedPets': ownedPets } },
    };
}
