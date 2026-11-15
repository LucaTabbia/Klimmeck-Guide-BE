// UNA TANTUM (Phase 24 D-07, D-20): modulo delle origini delle magie con la lista ordinata dei passi (livello e origine delle magie, tipo `arcane` nelle quest e nei risultati) — esce dal repo dopo il boot reale
import { Module, type Type } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { QuestResultTypeStep, QuestTypeStep } from './quest-type.step';
import { SpellFieldsStep } from './spell-fields.step';
import { spellOriginsBootProvider } from './spell-origins.boot';
import type { SpellOriginsStep } from './spell-origins.step';

const STEPS: Type<SpellOriginsStep>[] = [
    SpellFieldsStep,
    QuestTypeStep,
    QuestResultTypeStep,
];

// modelli letti dai passi: i passi li prendono dalla connessione, quindi vanno registrati PRIMA che la factory del boot li esegua
const MODELS = [
    { name: Spell.name, schema: SpellSchema },
    { name: Quest.name, schema: QuestSchema },
    { name: QuestResult.name, schema: QuestResultSchema },
];

// importato SOLO da AppModule: gli harness non migrano; esce dal repo dopo il boot reale (lo toglie l'orchestratore)
@Module({
    imports: [MongooseModule.forFeature(MODELS)],
    providers: [
        ...STEPS,
        spellOriginsBootProvider(
            STEPS,
            MODELS.map((model) => getModelToken(model.name)),
        ),
    ],
})
export class SpellOriginsMigrationModule {}
