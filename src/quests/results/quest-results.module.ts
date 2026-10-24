import { Module } from '@nestjs/common';
import { AuthzModule } from 'src/authz/authz.module';
import { QuestResultsReadModule } from './quest-results-read.module';
import { QuestResultsResolver } from './quest-results.resolver';

@Module({
    imports: [QuestResultsReadModule, AuthzModule],
    providers: [QuestResultsResolver],
})
export class QuestResultsModule {}
