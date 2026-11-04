import { Module } from '@nestjs/common';
import { QuestGenerationResolver } from './quest-generation.resolver';
import { QuestGenerationSweeper } from './quest-generation.sweeper';
import { QuestGenerationTriggerModule } from './quest-generation-trigger.module';

// importato SOLO da AppModule (D-30): corsa al boot, sweep periodico e mutation dell'oste
@Module({
    imports: [QuestGenerationTriggerModule],
    providers: [QuestGenerationSweeper, QuestGenerationResolver],
})
export class QuestGenerationModule {}
