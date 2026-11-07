import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { City, CitySchema } from 'src/models/city.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { LoreGeographyReader } from './lore-geography.reader';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: City.name, schema: CitySchema },
            { name: Lore.name, schema: LoreSchema },
        ]),
    ],
    providers: [LoreGeographyReader],
    exports: [LoreGeographyReader],
})
export class LoreGeographyModule {}
