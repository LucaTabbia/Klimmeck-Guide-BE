// il compagno dopo uno scontro (D-03, D-26): una sola regola per ogni percorso; la sconfitta è vita 1 a fine scontro
import {
    companionLevelFromXp,
    companionMaxLifeAt,
    companionMaxLifeOf,
    companionStoredLevelOf,
} from 'src/characters/pets/companion-level';
import {
    COMPANION_LIFE_FLOOR,
    companionDisplayName,
    companionStoredLifeOf,
    defeatedUntilOf,
} from 'src/characters/pets/companion-life';
import {
    normalisedOwnedPets,
    type NewOwnedPetEntry,
    type OwnedPetEntry,
} from 'src/characters/pets/owned-pet-entry';
import { refIdOf } from 'src/mongo/document-id';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import { petXpAward } from 'src/quests/outcomes/pets/pet-xp';

export interface CompanionAssets {
    pet?: unknown;
    ownedPets?: readonly OwnedPetEntry[] | null;
}

export interface CompanionCatalogEntry {
    name?: unknown;
    maxLifePoints?: unknown;
    maxXp?: unknown;
    recoveryTime?: unknown;
}

export interface CompanionFightInput {
    assets: CompanionAssets | null | undefined;
    // null = nessuno scontro: solo l'xp, come prima della fase
    effects: ParticipantEffects | null;
    enemiesXp: number;
    petMaxXp: ReadonlyMap<string, number>;
    petCatalog: ReadonlyMap<string, CompanionCatalogEntry>;
    at: Date;
}

export interface CompanionOutcomeDraft {
    name: string;
    lifeBefore: number;
    lifePoints: number;
    maxLifePoints: number;
    defeated: boolean;
    fullLifeAt: Date | null;
}

export interface CompanionAfterFight {
    // array intero nuovo, mai un path posizionale: convive col pet in premio (Phase 19 Pitfall 4)
    ownedPets: NewOwnedPetEntry[] | null;
    unequip: boolean;
    outcome: CompanionOutcomeDraft | null;
    gained: number;
}

interface FightingCompanion {
    owned: NewOwnedPetEntry[];
    index: number;
    entry: NewOwnedPetEntry;
    facts: CompanionCatalogEntry;
    maxXp: number | undefined;
}

const NOTHING: CompanionAfterFight = {
    ownedPets: null,
    unequip: false,
    outcome: null,
    gained: 0,
};

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

function fightingCompanionOf(
    input: CompanionFightInput,
): FightingCompanion | null {
    const companionId = refIdOf(input.assets?.pet);
    if (!companionId) return null;
    const owned = normalisedOwnedPets(input.assets?.ownedPets);
    const index = owned.findIndex((entry) => entry.pet.equals(companionId));
    if (index < 0) return null;
    const id = companionId.toHexString();
    const facts = input.petCatalog.get(id) ?? {};
    const maxXp = input.petMaxXp.get(id);
    return { owned, index, entry: owned[index], facts, maxXp };
}

// il tetto di xp del catalogo vince; senza, quello della mappa degli esiti
const levelFactsOf = (companion: FightingCompanion) => ({
    maxXp: companion.facts.maxXp ?? companion.maxXp,
});

function xpAfter(companion: FightingCompanion, enemiesXp: number) {
    const { maxXp } = companion;
    if (maxXp === undefined) return { xp: companion.entry.xp, gained: 0 };
    return petXpAward(enemiesXp, companion.entry.xp, maxXp);
}

// il ricalcolo dall'xp vince sul livello salvato quando l'xp cambia (D-39)
function levelAfter(companion: FightingCompanion, gained: number, xp: number) {
    const facts = levelFactsOf(companion);
    return gained > 0
        ? companionLevelFromXp(xp, facts.maxXp)
        : companionStoredLevelOf(companion.entry, facts);
}

const withEntry = (
    companion: FightingCompanion,
    entry: NewOwnedPetEntry,
): NewOwnedPetEntry[] =>
    companion.owned.map((other, position) =>
        position === companion.index ? entry : other,
    );

const sameEntry = (a: NewOwnedPetEntry, b: NewOwnedPetEntry): boolean =>
    a.xp === b.xp &&
    a.currentLifePoints === b.currentLifePoints &&
    a.level === b.level &&
    a.lifeAsOf?.getTime() === b.lifeAsOf?.getTime() &&
    a.defeatedUntil?.getTime() === b.defeatedUntil?.getTime();

// nessuno scontro o massimo non servibile: solo l'xp, la voce si scrive solo se l'xp cambia
function xpOnly(
    companion: FightingCompanion,
    enemiesXp: number,
    maxBefore: number | null,
): CompanionAfterFight {
    const { xp, gained } = xpAfter(companion, enemiesXp);
    if (gained <= 0) return NOTHING;
    const currentLifePoints =
        maxBefore === null
            ? companion.entry.currentLifePoints
            : companionStoredLifeOf(companion.entry, maxBefore);
    const level = levelAfter(companion, gained, xp);
    const entry = { ...companion.entry, xp, currentLifePoints, level };
    return {
        ownedPets: withEntry(companion, entry),
        unequip: false,
        outcome: null,
        gained,
    };
}

// voce del compagno che ha combattuto: lo sconfitto riposa da subito, il ferito resta nello slot e non riposa
function foughtEntry(
    entry: NewOwnedPetEntry,
    fields: Pick<NewOwnedPetEntry, 'xp' | 'currentLifePoints' | 'level'>,
    defeatedUntil: Date | null | undefined,
    at: Date,
): NewOwnedPetEntry {
    const written: NewOwnedPetEntry = { ...entry, ...fields };
    delete written.lifeAsOf;
    if (defeatedUntil === undefined) return written;
    delete written.defeatedUntil;
    return {
        ...written,
        lifeAsOf: at,
        ...(defeatedUntil && { defeatedUntil }),
    };
}

export function companionAfterFight(
    input: CompanionFightInput,
): CompanionAfterFight {
    const companion = fightingCompanionOf(input);
    if (!companion) return NOTHING;
    const { entry, facts } = companion;
    const maxBefore = companionMaxLifeOf(entry, {
        ...levelFactsOf(companion),
        maxLifePoints: facts.maxLifePoints,
    });
    if (input.effects === null || maxBefore === null) {
        return xpOnly(companion, input.enemiesXp, maxBefore);
    }
    // ordine D-37/D-38: prima la vita dello scontro al massimo di partenza, poi xp e livello, il massimo si rilegge dopo
    const lifeBefore = companionStoredLifeOf(entry, maxBefore);
    const lifeAfter = clamp(
        input.effects.companionLifeAfter ?? lifeBefore,
        COMPANION_LIFE_FLOOR,
        maxBefore,
    );
    const defeated = lifeAfter === COMPANION_LIFE_FLOOR;
    const { xp, gained } = xpAfter(companion, input.enemiesXp);
    const level = levelAfter(companion, gained, xp);
    const maxAfter =
        companionMaxLifeAt(level, facts.maxLifePoints) ?? maxBefore;
    const defeatedUntil = defeated
        ? defeatedUntilOf(input.at, facts.recoveryTime)
        : undefined;
    const written = foughtEntry(
        entry,
        { xp, currentLifePoints: lifeAfter, level },
        defeatedUntil,
        input.at,
    );
    return {
        ownedPets:
            defeated || !sameEntry(written, entry)
                ? withEntry(companion, written)
                : null,
        unequip: defeated,
        outcome: {
            name: companionDisplayName(entry.name, facts.name),
            lifeBefore,
            lifePoints: lifeAfter,
            maxLifePoints: maxAfter,
            defeated,
            fullLifeAt: defeatedUntil ?? null,
        },
        gained,
    };
}
