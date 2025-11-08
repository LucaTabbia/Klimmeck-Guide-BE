import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Road, RoadSchema } from 'src/models/road.model';
import { RoadsResolver } from './roads.resolver';
import { PointOfInterestsService } from 'src/pointsOfInterest/point-of-interest.service';
import { RoadsService } from './roads.service';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Road.name, schema: RoadSchema }]),
    ],
    providers: [RoadsService, RoadsResolver, PointOfInterestsService
    ],
    exports: [RoadsService],
})
export class RoadsModule { }
