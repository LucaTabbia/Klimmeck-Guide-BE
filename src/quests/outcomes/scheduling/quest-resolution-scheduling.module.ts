import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { Clock, SystemClock } from 'src/auth/clock';
import {
    QUEUE_CALL_TIMEOUT,
    QUEUE_CALL_TIMEOUT_MS,
} from 'src/travel/queue-call-timeout';
import { QUEST_RESOLUTION_QUEUE } from './quest-resolution-job';
import { QuestResolutionScheduler } from './quest-resolution.scheduler';

const QUEST_RESOLUTION_QUEUE_REGISTRATION = BullModule.registerQueue({
    name: QUEST_RESOLUTION_QUEUE,
});

// coda + scheduler condivisi da accettazione, viaggio ed esiti (D-24); senza il modulo push, nessun ciclo con viaggio o accettazione
@Module({
    imports: [QUEST_RESOLUTION_QUEUE_REGISTRATION],
    providers: [
        QuestResolutionScheduler,
        { provide: Clock, useClass: SystemClock },
        { provide: QUEUE_CALL_TIMEOUT, useValue: QUEUE_CALL_TIMEOUT_MS },
    ],
    exports: [QuestResolutionScheduler, QUEST_RESOLUTION_QUEUE_REGISTRATION],
})
export class QuestResolutionSchedulingModule {}
