import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { SpellStateMigrator } from './spell-state.migrator';
import { isUsageCount } from './spell-state.snapshot';
import {
    CREDIT_DUE_USAGE,
    CREDIT_LEGACY_USAGE,
    dueCreditFilter,
    legacyCreditFilter,
    spellStateArrayFilters,
} from './spell-state.updates';

// coppie (personaggio, magia) ricordate per processo: oltre il limite la più vecchia esce e verrà segnalata di nuovo
const UNCREDITABLE_MEMORY_LIMIT = 1_000;

const pairKey = (characterId: Types.ObjectId, spellId: Types.ObjectId) =>
    `${characterId.toHexString()}:${spellId.toHexString()}`;

// unico punto del credito per processor e sweep: nessun filtro sullo slot, la magia recupera anche fuori dagli slot (D-01)
@Injectable()
export class SpellRecoveryService {
    private readonly logger = new Logger(SpellRecoveryService.name);
    private readonly uncreditable = new Set<string>();

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Spell.name)
        private readonly spellModel: Model<SpellDocument>,
        private readonly migrator: SpellStateMigrator,
        private readonly clock: Clock,
    ) {}

    // ogni istante scaduto torna come uso, uno per update, al massimo maxUsages volte: idempotente sotto replay e gara con lo sweep (D-06, D-09)
    async recoverDue(
        characterId: Types.ObjectId,
        spellId: Types.ObjectId,
    ): Promise<number> {
        const maxUsages = await this.maxUsagesOf(characterId, spellId);
        if (maxUsages === null) return 0;
        await this.migrator.migrateOne(characterId);
        let credited = 0;
        while (credited < maxUsages) {
            const credit = await this.characterModel
                .updateOne(
                    dueCreditFilter(
                        characterId,
                        spellId,
                        maxUsages,
                        this.clock.now(),
                    ),
                    CREDIT_DUE_USAGE,
                    spellStateArrayFilters(spellId),
                )
                .exec();
            if (credit.modifiedCount !== 1) break;
            credited++;
        }
        if (credited > 0)
            this.logger.log(
                `Magia ${spellId.toHexString()} del personaggio ${characterId.toHexString()}: ${credited} usi restituiti`,
            );
        return credited;
    }

    // job accodati prima del deploy: solo il deficit non tracciato, gli istanti restano (D-06 rivista)
    async recoverLegacy(
        characterId: Types.ObjectId,
        spellId: Types.ObjectId,
    ): Promise<boolean> {
        const maxUsages = await this.maxUsagesOf(characterId, spellId);
        if (maxUsages === null) return false;
        await this.migrator.migrateOne(characterId);
        const credit = await this.characterModel
            .updateOne(
                legacyCreditFilter(characterId, spellId, maxUsages),
                CREDIT_LEGACY_USAGE,
                spellStateArrayFilters(spellId),
            )
            .exec();
        return credit.modifiedCount === 1;
    }

    // la voce resta nel DB con i suoi usi (D-05): lo sweep smette solo di chiederne il credito fino al prossimo processo
    isKnownUncreditable(
        characterId: Types.ObjectId,
        spellId: Types.ObjectId,
    ): boolean {
        return this.uncreditable.has(pairKey(characterId, spellId));
    }

    private async maxUsagesOf(
        characterId: Types.ObjectId,
        spellId: Types.ObjectId,
    ): Promise<number | null> {
        const spell = await this.spellModel
            .findById(spellId, { maxUsages: 1 })
            .lean<{ maxUsages?: unknown } | null>()
            .exec();
        const maxUsages = spell?.maxUsages;
        if (isUsageCount(maxUsages)) return maxUsages;
        this.rememberUncreditable(characterId, spellId, spell !== null);
        return null;
    }

    private rememberUncreditable(
        characterId: Types.ObjectId,
        spellId: Types.ObjectId,
        inCatalog: boolean,
    ): void {
        const key = pairKey(characterId, spellId);
        if (this.uncreditable.has(key)) return;
        if (this.uncreditable.size >= UNCREDITABLE_MEMORY_LIMIT) {
            const [oldest] = this.uncreditable;
            this.uncreditable.delete(oldest);
        }
        this.uncreditable.add(key);
        const reason = inCatalog
            ? 'con maxUsages non valido nel catalogo'
            : 'assente dal catalogo';
        this.logger.warn(
            `Magia ${spellId.toHexString()} ${reason}: nessun recupero per il personaggio ${characterId.toHexString()}`,
        );
    }
}
