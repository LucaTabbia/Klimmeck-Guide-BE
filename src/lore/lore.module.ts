import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { LoreResolver } from './lore.resolver';
import { LoreService } from './lore.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Lore.name, schema: LoreSchema },
        ]),
    ],
    providers: [LoreService, LoreResolver],
    exports: [LoreService],
})
export class LoreModule { }
