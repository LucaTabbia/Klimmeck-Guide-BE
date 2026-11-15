// UNA TANTUM (Phase 24 D-07, D-20): rinomina il tipo di quest `magic` in `arcane` nelle quest e nella fotografia dei risultati — esce dal repo dopo il boot reale
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { Quest } from 'src/models/quest/quest.model';
import type {
    SpellOriginsStep,
    SpellOriginsStepReport,
} from './spell-origins.step';

const OLD_SCHOOL_TYPE = 'magic';

// filtro sul valore vecchio: idempotente per costruzione, una seconda corsa non trova nulla
async function renameSchoolType(
    connection: Connection,
    modelName: string,
    path: string,
): Promise<SpellOriginsStepReport> {
    const collection = connection.model(modelName).collection;
    const found = await collection.countDocuments({
        [path]: { $in: [OLD_SCHOOL_TYPE, QuestType.arcane] },
    });
    const { modifiedCount: migrated } = await collection.updateMany(
        { [path]: OLD_SCHOOL_TYPE },
        { $set: { [path]: QuestType.arcane } },
    );
    return {
        found,
        migrated,
        alreadyDone: found - migrated,
        unmatched: 0,
    };
}

@Injectable()
export class QuestTypeStep implements SpellOriginsStep {
    readonly label = 'tipo delle quest';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    run(): Promise<SpellOriginsStepReport> {
        return renameSchoolType(this.connection, Quest.name, 'infos.type');
    }
}

@Injectable()
export class QuestResultTypeStep implements SpellOriginsStep {
    readonly label = 'tipo nei risultati';

    constructor(@InjectConnection() private readonly connection: Connection) {}

    run(): Promise<SpellOriginsStepReport> {
        return renameSchoolType(
            this.connection,
            QuestResult.name,
            'quest.type',
        );
    }
}
