import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { SpellsService } from './spells.service';
import { SpellsResolver } from './spells.resolver';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Spell.name, schema: SpellSchema },
        ]),
    ],
    providers: [SpellsService, SpellsResolver],
    exports: [SpellsService],
})
export class SpellsModule { }
