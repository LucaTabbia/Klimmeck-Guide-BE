import { Processor } from '@nestjs/bull';
import { QUEST_RESOLUTION_QUEUE } from './scheduling/quest-resolution-job';

@Processor(QUEST_RESOLUTION_QUEUE)
export class QuestResolutionProcessor {}
