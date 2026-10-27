import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateWithAggregationPipeline } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { describeError } from 'src/mongo/mongo-errors';
import {
    inconsistentFilter,
    isSpellStateOutOfRange,
    outOfRangeFilter,
    SpellCatalogEntry,
    spellStatesRepairPipeline,
    spellStatesTrimPipeline,
    unmigratedFilter,
} from './spell-state.migration';

export interface SpellStateMigrationReport {
    migrated: number;
    repaired: number;
    trimmed: number;
}

interface StoredSpellState {
    spell?: unknown;
    usages?: unknown;
    recoveries?: unknown;
}

interface OutOfRangeCharacter {
    _id: Types.ObjectId;
    status?: { spellStates?: StoredSpellState[] };
}

const OUT_OF_RANGE_WARNINGS_LIMIT = 50;

// le pipeline del piano 02 sono documenti Mongo puri: Mongoose le passa al driver senza cast
const asUpdatePipeline = (stages: Record<string, unknown>[]) =>
    stages as unknown as UpdateWithAggregationPipeline;

// atteso dal boot ma mai bloccante (D-08): un errore è solo loggato, il credito migra comunque per personaggio (F6)
@Injectable()
export class SpellStateMigrator implements OnApplicationBootstrap {
    private readonly logger = new Logger(SpellStateMigrator.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Spell.name)
        private readonly spellModel: Model<SpellDocument>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.migrateAll();
        } catch (error) {
            this.logger.error(
                `Migrazione degli stati delle magie fallita (${describeError(error)}): i recuperi migrano per personaggio al primo credito`,
            );
        }
    }

    async migrateAll(): Promise<SpellStateMigrationReport> {
        const catalog = await this.catalog();
        const repair = asUpdatePipeline(spellStatesRepairPipeline(catalog));
        const migrated = await this.characterModel
            .updateMany(unmigratedFilter(), repair)
            .exec();
        const repaired = await this.characterModel
            .updateMany(inconsistentFilter(), repair)
            .exec();
        const trimmed = await this.trim(outOfRangeFilter(catalog), catalog);
        this.reportRun(migrated.modifiedCount, repaired);
        return {
            migrated: migrated.modifiedCount,
            repaired: repaired.modifiedCount,
            trimmed,
        };
    }

    // no-op su un personaggio coerente; precede ogni credito perché processor e sweep partono prima del boot hook (F6)
    async migrateOne(characterId: Types.ObjectId): Promise<boolean> {
        const catalog = await this.catalog();
        const repaired = await this.characterModel
            .updateOne(
                { ...inconsistentFilter(), _id: characterId },
                asUpdatePipeline(spellStatesRepairPipeline(catalog)),
            )
            .exec();
        const trimmed = await this.trim(
            { ...outOfRangeFilter(catalog), _id: characterId },
            catalog,
        );
        return repaired.modifiedCount === 1 || trimmed > 0;
    }

    // istanti che il credito non può più consumare (usages ≥ maxUsages o lista troppo lunga): WARN per voce, poi taglio; gli usi restano (D-03)
    private async trim(
        filter: Record<string, unknown>,
        catalog: readonly SpellCatalogEntry[],
    ): Promise<number> {
        await this.warnOutOfRange(filter, catalog);
        const trimmed = await this.characterModel
            .updateMany(
                filter,
                asUpdatePipeline(spellStatesTrimPipeline(catalog)),
            )
            .exec();
        return trimmed.modifiedCount;
    }

    private async warnOutOfRange(
        filter: Record<string, unknown>,
        catalog: readonly SpellCatalogEntry[],
    ): Promise<void> {
        const maxUsagesOf = new Map(
            catalog.map(({ id, maxUsages }) => [id.toHexString(), maxUsages]),
        );
        const characters = await this.characterModel.collection
            .find(filter, { projection: { 'status.spellStates': 1 } })
            .limit(OUT_OF_RANGE_WARNINGS_LIMIT)
            .toArray();
        for (const character of characters as OutOfRangeCharacter[]) {
            for (const state of character.status?.spellStates ?? []) {
                if (
                    !isSpellStateOutOfRange(
                        state,
                        maxUsagesOf.get(String(state.spell)),
                    )
                )
                    continue;
                this.logger.warn(
                    `Stato della magia ${String(state.spell)} del personaggio ${character._id.toHexString()} fuori dai limiti del catalogo: istanti in eccesso scartati, usi invariati`,
                );
            }
        }
    }

    private reportRun(
        migrated: number,
        repaired: { matchedCount: number; modifiedCount: number },
    ): void {
        if (migrated > 0)
            this.logger.log(
                `Stati delle magie: migrati ${migrated} personaggi`,
            );
        if (repaired.modifiedCount > 0)
            this.logger.warn(
                `Stati delle magie riparati per ${repaired.modifiedCount} personaggi`,
            );
        // un mirror che punta a una magia non conosciuta resta incoerente: la pipeline non lo cambia, lo segnala ogni boot
        const unrepairable = repaired.matchedCount - repaired.modifiedCount;
        if (unrepairable > 0)
            this.logger.warn(
                `Stati delle magie incoerenti ma non riparabili per ${unrepairable} personaggi: slot di magie non conosciute`,
            );
    }

    private async catalog(): Promise<SpellCatalogEntry[]> {
        const spells = await this.spellModel
            .find({}, { maxUsages: 1 })
            .lean<{ _id: Types.ObjectId; maxUsages?: unknown }[]>()
            .exec();
        return spells.flatMap(({ _id, maxUsages }) =>
            isUsageCount(maxUsages) ? [{ id: _id, maxUsages }] : [],
        );
    }
}

// maxUsages del catalogo utilizzabile: intero non negativo (il catalogo non ha validazione lato DB)
export function isUsageCount(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}
