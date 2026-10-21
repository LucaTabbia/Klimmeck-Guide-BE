import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { RoadsModule } from 'src/roads/roads.module';
import { TRAVEL_QUEUE } from './travel-job';
import { TravelPlanner } from './travel-planner.service';
import { TravelScheduler } from './travel-scheduler.service';

const TRAVEL_QUEUE_REGISTRATION = BullModule.registerQueue({
    name: TRAVEL_QUEUE,
});

// planner + scheduler condivisi da viaggio libero e accettazione quest (D-21); senza il modulo push (C6)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Pet.name, schema: PetSchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: City.name, schema: CitySchema },
        ]),
        RoadsModule,
        TRAVEL_QUEUE_REGISTRATION,
    ],
    providers: [
        TravelPlanner,
        TravelScheduler,
        { provide: Clock, useClass: SystemClock },
    ],
    exports: [TravelPlanner, TravelScheduler, TRAVEL_QUEUE_REGISTRATION],
})
export class TravelPlanningModule {}
