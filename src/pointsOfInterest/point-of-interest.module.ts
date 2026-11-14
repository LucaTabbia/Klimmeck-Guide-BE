import { City, CitySchema } from 'src/models/city.model';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { PointOfInterestsResolver } from './point-of-interest.resolver';
import { PointOfInterestsService } from './point-of-interest.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: City.name, schema: CitySchema },
        ]),
    ],
    providers: [PointOfInterestsService, PointOfInterestsResolver],
    exports: [PointOfInterestsService],
})
export class PointOfInterestModule {}
