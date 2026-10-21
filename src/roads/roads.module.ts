import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Road, RoadSchema } from 'src/models/road.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { RoadsResolver } from './roads.resolver';
import { PointOfInterestsService } from 'src/pointsOfInterest/point-of-interest.service';
import { RoadsService } from './roads.service';

@Module({
    imports: [
        // PointOfInterestsService vive qui: il modulo registra il proprio modello e si importa anche fuori dal MongoModule globale (C3)
        MongooseModule.forFeature([
            { name: Road.name, schema: RoadSchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
        ]),
    ],
    providers: [RoadsService, RoadsResolver, PointOfInterestsService],
    exports: [RoadsService],
})
export class RoadsModule {}
