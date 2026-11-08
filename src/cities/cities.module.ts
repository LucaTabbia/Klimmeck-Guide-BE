import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CitiesResolver } from './cities.resolver';
import { CitiesService } from './cities.service';
import { LoreVisibilityModule } from 'src/lore/lore-visibility.module';
import { City, CitySchema } from 'src/models/city.model';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: City.name, schema: CitySchema }]),
        LoreVisibilityModule,
    ],
    providers: [CitiesService, CitiesResolver],
    exports: [CitiesService],
})
export class CitiesModule {}
