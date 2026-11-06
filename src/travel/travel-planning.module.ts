import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { RoadsModule } from 'src/roads/roads.module';
import {
    QUEUE_CALL_TIMEOUT,
    QUEUE_CALL_TIMEOUT_MS,
} from 'src/queues/queue-call-timeout';
import { TravelPantryReader } from './food/travel-pantry.reader';
import { TRAVEL_QUEUE } from './travel-job';
import { TravelPlanner } from './travel-planner.service';
import { TravelScheduler } from './travel-scheduler.service';

const TRAVEL_QUEUE_REGISTRATION = BullModule.registerQueue({
    name: TRAVEL_QUEUE,
});

// planner + scheduler condivisi da viaggio libero e accettazione quest (D-21); senza il modulo push (C6); e dispensa del viaggio (Phase 14)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Pet.name, schema: PetSchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: City.name, schema: CitySchema },
            { name: LootItem.name, schema: LootItemSchema },
        ]),
        RoadsModule,
        TRAVEL_QUEUE_REGISTRATION,
    ],
    providers: [
        TravelPlanner,
        TravelScheduler,
        TravelPantryReader,
        { provide: Clock, useClass: SystemClock },
        { provide: QUEUE_CALL_TIMEOUT, useValue: QUEUE_CALL_TIMEOUT_MS },
    ],
    exports: [
        TravelPlanner,
        TravelScheduler,
        TravelPantryReader,
        TRAVEL_QUEUE_REGISTRATION,
    ],
})
export class TravelPlanningModule {}
