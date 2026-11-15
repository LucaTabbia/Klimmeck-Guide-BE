import { ObjectType, Field, Int, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { MAX_LEVEL } from 'src/quests/outcomes/progression/level-table';
import { Lore } from './lore.model';
import { SpellOrigin } from './enums/spell-origin.enum';
import { UseType } from './enums/use-type.enum';
import { EnergyDamage, EnergyDamageSchema } from './common/energy-damage';

@ObjectType()
@Schema()
export class Spell {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    @Prop({ type: String })
    name: string;

    @Field(() => String)
    @Prop({ type: String })
    description: string;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(UseType) })
    useType: UseType;

    // macroclasse (Phase 24 D-01): decide solo quale quest di scuola insegna la magia
    @Field(() => String)
    @Prop({ type: String, enum: Object.values(SpellOrigin), required: true })
    origin: SpellOrigin;

    @Field(() => EnergyDamage)
    @Prop({ type: EnergyDamageSchema })
    energyDamage: EnergyDamage;

    @Field(() => Int)
    @Prop({ type: Number })
    requiredLearnTime: number;

    // livello minimo del personaggio per impararla (Phase 24 D-07), mai oltre l'ultimo livello della tabella
    @Field(() => Int)
    @Prop({ type: Number, required: true, min: 1, max: MAX_LEVEL })
    minLevelToLearn: number;

    @Field(() => Int)
    @Prop({ type: Number })
    recoveryTime: number;

    @Field(() => Int)
    @Prop({ type: Number })
    maxUsages: number;

    // lore sbloccate quando la magia viene imparata (Phase 24 D-24): ogni magia punta alla lore della sua origine; sul filo filtrate per viewer dal resolver sul tipo
    @Field(() => [Lore])
    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: Lore.name,
        default: [],
    })
    relatedLore: Lore[];
}

export type SpellDocument = Spell & Document;
export const SpellSchema = SchemaFactory.createForClass(Spell);
