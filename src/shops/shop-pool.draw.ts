import { Types } from 'mongoose';
import { sameId } from 'src/mongo/document-id';
import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { mulberry32, seedOf } from './seeded-random';
import {
    SELLABLE_PET_PLACEMENTS,
    SHOP_LOOT_GUARANTEES,
    SHOP_POOL_SIZES,
    SHOP_RARITY_WEIGHTS,
    SHOP_SEED_VERSION,
    TierWeight,
} from './shop-pool.constants';
import {
    isSeedCandidate,
    isShelfEligible,
    SeedCandidate,
} from './shop-pool.rules';

type PoolList = 'equipment' | 'loot';
type RandomStream = () => number;

// metodo del resto maggiore su interi: i pareggi vanno alla fascia più bassa, cioè la prima di weights (D-08)
export function tierQuotas(
    total: number,
    weights: readonly TierWeight[],
): Map<RarityType, number> {
    const shares = weights.map(({ rarity, percent }) => ({
        rarity,
        quota: Math.floor((total * percent) / 100),
        remainder: (total * percent) % 100,
    }));
    const missing = total - shares.reduce((sum, { quota }) => sum + quota, 0);
    const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder);
    byRemainder.slice(0, missing).forEach((share) => (share.quota += 1));
    return new Map(shares.map(({ rarity, quota }) => [rarity, quota]));
}

// Fisher–Yates parziale: nessun reinserimento, l'input non viene toccato
export function takeWithoutReplacement<T>(
    candidates: readonly T[],
    count: number,
    next: RandomStream,
): T[] {
    const pool = [...candidates];
    const taken: T[] = [];
    while (taken.length < count && pool.length > 0) {
        const index = Math.floor(next() * pool.length);
        taken.push(pool[index]);
        pool[index] = pool[pool.length - 1];
        pool.pop();
    }
    return taken;
}

// l'ordine di ritorno di Mongo non è garantito: il sorteggio parte sempre dall'ordine per id (D-24, Pitfall 7)
const byObjectId = <T extends { _id: Types.ObjectId }>(items: readonly T[]) =>
    [...items].sort((a, b) =>
        a._id.toHexString().localeCompare(b._id.toHexString()),
    );

// un flusso per lista: ri-seminare una lista sola ridà lo stesso risultato a catalogo invariato (D-24)
const streamOf = (cityId: Types.ObjectId, list: PoolList): RandomStream =>
    mulberry32(seedOf(SHOP_SEED_VERSION, cityId.toHexString(), list));

const weightsOf = (size: CitySize): readonly TierWeight[] =>
    SHOP_RARITY_WEIGHTS[size];

const eligibleFor = (candidates: readonly SeedCandidate[], size: CitySize) =>
    byObjectId(candidates.filter((item) => isSeedCandidate(item, size)));

const untakenOf = (
    eligible: readonly SeedCandidate[],
    taken: ReadonlySet<string>,
    accepts: (item: SeedCandidate) => boolean,
) =>
    eligible.filter(
        (item) => !taken.has(item._id.toHexString()) && accepts(item),
    );

// dalla fascia più alta alla più bassa: ciò che manca a una fascia corta passa a quella inferiore (D-08)
function drawTiers(
    eligible: readonly SeedCandidate[],
    weights: readonly TierWeight[],
    quotas: ReadonlyMap<RarityType, number>,
    next: RandomStream,
    taken: Set<string>,
): Types.ObjectId[] {
    const drawnByTier = new Map<RarityType, Types.ObjectId[]>();
    let carry = 0;
    for (const { rarity } of [...weights].reverse()) {
        const want = (quotas.get(rarity) ?? 0) + carry;
        const drawn = takeWithoutReplacement(
            untakenOf(eligible, taken, (item) => item.rarity === rarity),
            want,
            next,
        );
        drawn.forEach((item) => taken.add(item._id.toHexString()));
        drawnByTier.set(
            rarity,
            drawn.map((item) => item._id),
        );
        carry = want - drawn.length;
    }
    return weights.flatMap(({ rarity }) => drawnByTier.get(rarity) ?? []);
}

export function drawEquipment(
    cityId: Types.ObjectId,
    size: CitySize,
    candidates: readonly SeedCandidate[],
): Types.ObjectId[] {
    const weights = weightsOf(size);
    return drawTiers(
        eligibleFor(candidates, size),
        weights,
        tierQuotas(SHOP_POOL_SIZES[size].equipment, weights),
        streamOf(cityId, 'equipment'),
        new Set(),
    );
}

export interface LootDraw {
    ids: Types.ObjectId[];
    missingGuarantees: EffectType[];
}

// le garanzie stanno dentro la quota: ogni pesca consuma una unità della fascia ammessa più bassa che ha l'effetto (D-09)
export function drawLoot(
    cityId: Types.ObjectId,
    size: CitySize,
    candidates: readonly SeedCandidate[],
): LootDraw {
    const weights = weightsOf(size);
    const eligible = eligibleFor(candidates, size);
    const quotas = tierQuotas(SHOP_POOL_SIZES[size].loot, weights);
    const next = streamOf(cityId, 'loot');
    const taken = new Set<string>();
    const guaranteed: Types.ObjectId[] = [];
    const missingGuarantees: EffectType[] = [];
    const guaranteeUnits = SHOP_LOOT_GUARANTEES.flatMap(({ effect, count }) =>
        Array.from({ length: count }, () => effect),
    );
    for (const effect of guaranteeUnits) {
        const pick = pickGuarantee(
            eligible,
            weights,
            quotas,
            taken,
            effect,
            next,
        );
        if (pick === undefined) {
            missingGuarantees.push(effect);
            continue;
        }
        taken.add(pick._id.toHexString());
        guaranteed.push(pick._id);
    }
    const rest = drawTiers(eligible, weights, quotas, next, taken);
    return { ids: [...guaranteed, ...rest], missingGuarantees };
}

function pickGuarantee(
    eligible: readonly SeedCandidate[],
    weights: readonly TierWeight[],
    quotas: Map<RarityType, number>,
    taken: ReadonlySet<string>,
    effect: EffectType,
    next: RandomStream,
): SeedCandidate | undefined {
    for (const { rarity } of weights) {
        const quota = quotas.get(rarity) ?? 0;
        if (quota === 0) continue;
        const [pick] = takeWithoutReplacement(
            untakenOf(
                eligible,
                taken,
                (item) => item.rarity === rarity && item.effect === effect,
            ),
            1,
            next,
        );
        if (pick === undefined) continue;
        quotas.set(rarity, quota - 1);
        return pick;
    }
    return undefined;
}

export interface PetShopCity {
    name?: string | null;
    type: CityType;
}

// nessun sorteggio per i pet: solo il piazzamento per nome + CityType, se il pet esiste ed è vendibile (D-10, D-24)
export function petsFor(
    city: PetShopCity,
    pets: readonly SeedCandidate[],
): Types.ObjectId[] {
    return SELLABLE_PET_PLACEMENTS.filter(({ cities }) =>
        cities.some(
            ({ name, type }) => name === city.name && type === city.type,
        ),
    ).flatMap(({ petId }) => {
        const pet = pets.find((entry) =>
            sameId(entry._id, new Types.ObjectId(petId)),
        );
        return pet !== undefined && isShelfEligible(pet) ? [pet._id] : [];
    });
}
