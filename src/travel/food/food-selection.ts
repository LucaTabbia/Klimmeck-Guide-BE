// scarto minimo, poi meno unità, poi minor valore di vendita, poi id più basso (D-06); bounded knapsack lessicografico con splitting binario e tetto needed + maxPower − 1 (D-07): il costo non dipende dalle quantità
import type { Types } from 'mongoose';
import { sameId } from 'src/mongo/document-id';

export interface FoodStack {
    itemId: Types.ObjectId;
    power: number;
    sellCopper: number;
    quantity: number;
}

export interface ConsumedFood {
    itemId: Types.ObjectId;
    quantity: number;
}

export interface FoodSelection {
    consumed: ConsumedFood[];
    covered: number;
}

interface Packet {
    stack: FoodStack;
    units: number;
    power: number;
    sell: number;
}

const NOTHING_EATEN: FoodSelection = { consumed: [], covered: 0 };

export function selectFood(
    needed: number,
    stacks: readonly FoodStack[],
): FoodSelection {
    const edible = edibleStacksOf(stacks);
    if (needed <= 0 || edible.length === 0) return { ...NOTHING_EATEN };
    const total = edible.reduce((sum, s) => sum + s.power * s.quantity, 0);
    if (total < needed) return eatEverything(edible, total);
    const cap = needed + Math.max(...edible.map((s) => s.power)) - 1;
    const packets = packetsOf(byHexId(edible), cap);
    const { covered, taken } = knapsack(needed, cap, packets);
    const eaten = rebuild(covered, packets, taken);
    return {
        consumed: edible
            .filter((s) => (eaten.get(s) ?? 0) > 0)
            .map((s) => ({ itemId: s.itemId, quantity: eaten.get(s) ?? 0 })),
        covered,
    };
}

// prima occorrenza di ogni id, valida o no, poi il filtro: applyTradeToInventory scala solo la prima voce
function edibleStacksOf(stacks: readonly FoodStack[]): FoodStack[] {
    return firstEntriesOf(stacks)
        .filter(isEdible)
        .map((stack) => ({
            ...stack,
            sellCopper: sellCopperOf(stack.sellCopper),
        }));
}

function firstEntriesOf(stacks: readonly FoodStack[]): FoodStack[] {
    const first: FoodStack[] = [];
    for (const stack of stacks) {
        if (first.some((kept) => sameId(kept.itemId, stack.itemId))) continue;
        first.push(stack);
    }
    return first;
}

function isEdible({ power, quantity }: FoodStack): boolean {
    return (
        Number.isInteger(power) &&
        power > 0 &&
        Number.isInteger(quantity) &&
        quantity >= 1
    );
}

function sellCopperOf(sellCopper: number): number {
    return Number.isFinite(sellCopper) && sellCopper >= 0 ? sellCopper : 0;
}

function eatEverything(edible: FoodStack[], total: number): FoodSelection {
    return {
        consumed: edible.map((s) => ({
            itemId: s.itemId,
            quantity: s.quantity,
        })),
        covered: total,
    };
}

function byHexId(edible: FoodStack[]): FoodStack[] {
    return [...edible].sort((a, b) =>
        a.itemId.toHexString().localeCompare(b.itemId.toHexString()),
    );
}

// copie utili ⌈cap / power⌉ per stack, in pacchetti binari 1, 2, 4, …: il costo è additivo, lo splitting resta esatto
function packetsOf(stacks: FoodStack[], cap: number): Packet[] {
    const packets: Packet[] = [];
    for (const stack of stacks) {
        let useful = Math.min(stack.quantity, Math.ceil(cap / stack.power));
        for (let k = 1; useful > 0; k *= 2) {
            const units = Math.min(k, useful);
            packets.push({
                stack,
                units,
                power: units * stack.power,
                sell: units * stack.sellCopper,
            });
            useful -= units;
        }
    }
    return packets;
}

// DP 0/1 su (unità, vendita) con miglioramento stretto: a parità vince il pacchetto venuto prima, cioè l'id più basso
function knapsack(
    needed: number,
    cap: number,
    packets: Packet[],
): { covered: number; taken: Uint8Array[] } {
    const units = new Float64Array(cap + 1).fill(Infinity);
    const sell = new Float64Array(cap + 1).fill(Infinity);
    units[0] = 0;
    sell[0] = 0;
    const taken = packets.map((packet) => {
        const row = new Uint8Array(cap + 1);
        for (let s = cap; s >= packet.power; s--) {
            const u = units[s - packet.power] + packet.units;
            const v = sell[s - packet.power] + packet.sell;
            if (u > units[s] || (u === units[s] && v >= sell[s])) continue;
            units[s] = u;
            sell[s] = v;
            row[s] = 1;
        }
        return row;
    });
    let covered = needed;
    while (!Number.isFinite(units[covered])) covered++;
    return { covered, taken };
}

function rebuild(
    covered: number,
    packets: Packet[],
    taken: Uint8Array[],
): Map<FoodStack, number> {
    const eaten = new Map<FoodStack, number>();
    let s = covered;
    for (let j = packets.length - 1; j >= 0; j--) {
        if (!taken[j][s]) continue;
        const { stack, units, power } = packets[j];
        eaten.set(stack, (eaten.get(stack) ?? 0) + units);
        s -= power;
    }
    return eaten;
}
