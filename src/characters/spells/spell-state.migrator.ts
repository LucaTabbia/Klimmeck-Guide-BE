import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateWithAggregationPipeline } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { describeError } from 'src/mongo/mongo-errors';
import { isUsageCount } from './spell-state.snapshot';
import {
    isSpellStateOutOfRange,
    outOfRangeFilter,
    SpellCatalogEntry,
    spellStatesTrimPipeline,
} from './spell-state.migration';

export interface SpellStateMigrationReport {
    trimmed: number;
}

interface StoredSpellState {
    spell?: unknown;
    usages?: unknown;
    recoveries?: unknown;
    // il taglio la conserva così com'è (Phase 19 D-21)
    active?: unknown;
}

interface OutOfRangeCharacter {
    _id: Types.ObjectId;
    status?: { spellStates?: StoredSpellState[] };
}

const OUT_OF_RANGE_WARNINGS_LIMIT = 50;

// la pipeline del taglio è un documento Mongo puro: Mongoose la passa al driver senza cast
const asUpdatePipeline = (stages: Record<string, unknown>[]) =>
    stages as unknown as UpdateWithAggregationPipeline;

// solo taglio (Phase 19 D-21): le voci non si ricostruiscono mai da altre liste; atteso dal boot ma mai bloccante (D-08): un errore è solo loggato, il credito taglia comunque per personaggio (F6)
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
                `Taglio degli stati delle magie fallito (${describeError(error)}): i recuperi tagliano per personaggio al primo credito`,
            );
        }
    }

    async migrateAll(): Promise<SpellStateMigrationReport> {
        const catalog = await this.catalog();
        return { trimmed: await this.trim(outOfRangeFilter(catalog), catalog) };
    }

    // no-op su un personaggio nei limiti; precede ogni credito perché processor e sweep partono prima del boot hook (F6)
    async migrateOne(characterId: Types.ObjectId): Promise<boolean> {
        const catalog = await this.catalog();
        const trimmed = await this.trim(
            { ...outOfRangeFilter(catalog), _id: characterId },
            catalog,
        );
        return trimmed > 0;
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
