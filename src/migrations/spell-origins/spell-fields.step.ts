// UNA TANTUM (Phase 24 D-01, D-07): scrive livello minimo e origine di default sulle magie che non li hanno; il campo vecchio resta a DB — esce dal repo dopo il boot reale
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection, Types } from 'mongoose';
import { SpellOrigin } from 'src/models/enums/spell-origin.enum';
import { Spell } from 'src/models/spell.model';
import { levelRowFor } from 'src/quests/outcomes/progression/level-table';
import {
    asRead,
    type SpellOriginsStep,
    type SpellOriginsStepReport,
    writeNotAppliedLine,
} from './spell-origins.step';

export interface SpellFieldsSet {
    minLevelToLearn?: number;
    origin?: SpellOrigin;
}

export type SpellMigration =
    | { set: SpellFieldsSet }
    | 'alreadyDone'
    | 'unmatched';

export interface LegacySpellFields {
    minXpToLearn?: unknown;
    minLevelToLearn?: unknown;
    origin?: unknown;
}

const isMissing = (value: unknown): boolean =>
    value === undefined || value === null;

const isConvertibleXp = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

// «manca» = assente o nullo; un valore presente, valido o no, non si corregge (C-5)
export function spellMigrationOf(spell: LegacySpellFields): SpellMigration {
    const levelMissing = isMissing(spell.minLevelToLearn);
    const originMissing = isMissing(spell.origin);
    if (!levelMissing && !originMissing) return 'alreadyDone';
    if (levelMissing && !isConvertibleXp(spell.minXpToLearn))
        return 'unmatched';
    const set: SpellFieldsSet = {};
    if (levelMissing && isConvertibleXp(spell.minXpToLearn))
        set.minLevelToLearn = levelRowFor(spell.minXpToLearn).level;
    if (originMissing) set.origin = SpellOrigin.arcane;
    return { set };
}

interface LegacySpell extends LegacySpellFields {
    _id: Types.ObjectId;
}

const LEGACY_FIELDS = {
    _id: 1,
    minXpToLearn: 1,
    minLevelToLearn: 1,
    origin: 1,
} as const;

@Injectable()
export class SpellFieldsStep implements SpellOriginsStep {
    readonly label = 'magie';

    private readonly logger = new Logger(SpellFieldsStep.name);

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<SpellOriginsStepReport> {
        // driver nativo: lo schema strict non conosce più `minXpToLearn`; la collection viene dal modello
        const spells = this.connection.model(Spell.name).collection;
        const found = await spells
            .find({}, { projection: LEGACY_FIELDS })
            .sort({ _id: 1 })
            .toArray();
        const report: SpellOriginsStepReport = {
            found: found.length,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 0,
        };
        for (const spell of found as LegacySpell[]) {
            const migration = spellMigrationOf(spell);
            if (migration === 'alreadyDone') report.alreadyDone += 1;
            else if (migration === 'unmatched') report.unmatched += 1;
            else if (await this.applied(spell, migration.set))
                report.migrated += 1;
            else report.unmatched += 1;
        }
        return report;
    }

    // scrittura condizionata sui valori letti: un documento cambiato nel frattempo resta com'è
    private async applied(
        spell: LegacySpell,
        set: SpellFieldsSet,
    ): Promise<boolean> {
        const spells = this.connection.model(Spell.name).collection;
        const { modifiedCount } = await spells.updateOne(
            {
                _id: spell._id,
                minLevelToLearn: asRead(spell.minLevelToLearn),
                origin: asRead(spell.origin),
            },
            { $set: set },
        );
        if (modifiedCount > 0) return true;
        this.logger.warn(
            writeNotAppliedLine(this.label, 'magia', spell._id.toHexString()),
        );
        return false;
    }
}
