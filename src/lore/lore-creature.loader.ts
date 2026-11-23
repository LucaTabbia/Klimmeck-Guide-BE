import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type FilterQuery } from 'mongoose';
import { ENEMY_WIRE_POPULATE } from 'src/enemies/enemies.service';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { creaturesByLore, LoreCreature } from './lore-creature';
import { withoutOrphanRelatedLore } from './related-lore';

type ReadCreatures<T> = (loreHexes: string[]) => Promise<T[]>;

interface Batch<T> {
    loreHexes: Set<string>;
    creatures: Promise<Map<string, T>>;
}

// i resolver fratelli di una lista ripartono nello stesso giro di microtask: il blocco si chiude al tick successivo
const nextTick = (): Promise<void> =>
    new Promise((resolve) => process.nextTick(resolve));

// caricamento a blocchi per richiesta (quick 261123-lcv): le lore chieste nello stesso giro si leggono con una sola query
export class CreaturesOfLoreBatcher<T extends LoreCreature> {
    private readonly open = new WeakMap<object, Batch<T>>();

    constructor(private readonly read: ReadCreatures<T>) {}

    async load(scope: object, loreHex: string): Promise<T | null> {
        const batch = this.open.get(scope) ?? this.openBatch(scope);
        batch.loreHexes.add(loreHex);
        return (await batch.creatures).get(loreHex) ?? null;
    }

    private openBatch(scope: object): Batch<T> {
        const loreHexes = new Set<string>();
        const batch: Batch<T> = {
            loreHexes,
            creatures: Promise.resolve()
                .then(nextTick)
                .then(() => {
                    this.open.delete(scope);
                    return this.read([...loreHexes]);
                })
                .then(creaturesByLore),
        };
        this.open.set(scope, batch);
        return batch;
    }
}

// le due forme salvate di un ref (ObjectId, o stringa scritta da uno script di contenuto): Mongoose casta $in sul path, $expr no
export function carryingAnyLore(loreHexes: string[]): FilterQuery<unknown> {
    const savedAsString = {
        $expr: {
            $setIsSubset: [
                [true],
                {
                    $map: {
                        input: {
                            $cond: [
                                { $isArray: '$relatedLore' },
                                '$relatedLore',
                                [],
                            ],
                        },
                        in: { $in: ['$$this', loreHexes] },
                    },
                },
            ],
        },
    };
    return {
        $or: [
            { relatedLore: { $in: loreHexes.map(objectIdFromHex) } },
            savedAsString,
        ],
    };
}

// nemico e pet nella stessa forma di `enemys` e `pets`; l'ordine per _id rende stabile la lettura, la scelta la fa creaturesByLore
@Injectable()
export class LoreCreatureLoader {
    private readonly enemies = new CreaturesOfLoreBatcher<Enemy>(
        async (loreHexes) => {
            const enemies = await this.enemyModel
                .find(carryingAnyLore(loreHexes))
                .sort({ _id: 1 })
                .populate(ENEMY_WIRE_POPULATE)
                .exec();
            return enemies.map(withoutOrphanRelatedLore);
        },
    );

    private readonly pets = new CreaturesOfLoreBatcher<Pet>((loreHexes) =>
        this.petModel.find(carryingAnyLore(loreHexes)).sort({ _id: 1 }).exec(),
    );

    constructor(
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    ) {}

    enemyOf(scope: object, loreHex: string): Promise<Enemy | null> {
        return this.enemies.load(scope, loreHex);
    }

    petOf(scope: object, loreHex: string): Promise<Pet | null> {
        return this.pets.load(scope, loreHex);
    }
}
