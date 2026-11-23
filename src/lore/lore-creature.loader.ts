import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type FilterQuery } from 'mongoose';
import { ENEMY_WIRE_POPULATE } from 'src/enemies/enemies.service';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import { creaturesByOwnLore, LoreCreature } from './lore-creature';
import { withoutOrphanRelatedLore } from './related-lore';

type ReadOwners<T> = (loreHexes: string[]) => Promise<Map<string, T>>;

interface Batch<T> {
    loreHexes: Set<string>;
    owners: Promise<Map<string, T>>;
}

// i resolver fratelli di una lista ripartono nello stesso giro di microtask: il blocco si chiude al tick successivo
const nextTick = (): Promise<void> =>
    new Promise((resolve) => process.nextTick(resolve));

// caricamento a blocchi per richiesta (quick 261123-lcv): le lore chieste nello stesso giro si leggono con una sola query
export class CreaturesOfLoreBatcher<T> {
    private readonly open = new WeakMap<object, Batch<T>>();

    constructor(private readonly read: ReadOwners<T>) {}

    async load(scope: object, loreHex: string): Promise<T | null> {
        const batch = this.open.get(scope) ?? this.openBatch(scope);
        batch.loreHexes.add(loreHex);
        return (await batch.owners).get(loreHex) ?? null;
    }

    private openBatch(scope: object): Batch<T> {
        const loreHexes = new Set<string>();
        const batch: Batch<T> = {
            loreHexes,
            owners: Promise.resolve()
                .then(nextTick)
                .then(() => {
                    this.open.delete(scope);
                    return this.read([...loreHexes]);
                }),
        };
        this.open.set(scope, batch);
        return batch;
    }
}

// la prima relatedLore nelle due forme salvate (ObjectId, o stringa scritta da uno script di contenuto):
// Mongoose casterebbe un filtro sul path, $expr confronta l'esadecimale
export function owningAnyLore(loreHexes: string[]): FilterQuery<unknown> {
    const related = {
        $cond: [{ $isArray: '$relatedLore' }, '$relatedLore', []],
    };
    return {
        $expr: {
            $in: [{ $toString: { $arrayElemAt: [related, 0] } }, loreHexes],
        },
    };
}

// nemico e pet nella stessa forma di `enemys` e `pets`; il proprietario si decide sui ref letti, prima del populate che scarta gli orfani
@Injectable()
export class LoreCreatureLoader {
    private readonly logger = new Logger(LoreCreatureLoader.name);

    private readonly enemies = new CreaturesOfLoreBatcher<Enemy>(
        async (loreHexes) => {
            const found = await this.enemyModel
                .find(owningAnyLore(loreHexes))
                .exec();
            const owners = this.ownersOf(found, 'nemici');
            await this.enemyModel.populate(
                [...owners.values()],
                ENEMY_WIRE_POPULATE,
            );
            owners.forEach(withoutOrphanRelatedLore);
            return owners;
        },
    );

    private readonly pets = new CreaturesOfLoreBatcher<Pet>(
        async (loreHexes) => {
            const found = await this.petModel
                .find(owningAnyLore(loreHexes))
                .exec();
            return this.ownersOf(found, 'pet');
        },
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

    private ownersOf<T extends LoreCreature>(
        creatures: T[],
        kind: string,
    ): Map<string, T> {
        const { byLore, contested } = creaturesByOwnLore(creatures);
        for (const lore of contested) {
            this.logger.warn(
                `Più ${kind} hanno la lore ${lore} come prima voce: servito quello con l'id più piccolo`,
            );
        }
        return byLore;
    }
}
