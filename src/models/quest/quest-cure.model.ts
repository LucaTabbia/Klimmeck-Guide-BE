import { Field, Float, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { InjuryType } from '../enums/injury-type.enum';

// cura esplicita della quest (Phase 18 D-01): quota di vita come tetto e ferite guarite; assente o null = la quest non cura
@ObjectType()
@Schema({ _id: false })
export class QuestCure {
    @Field(() => Float)
    @Prop({ type: Number, required: true, min: 0, max: 1 })
    lifePointsShare: number;

    @Field(() => [InjuryType])
    @Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
    canHeal: InjuryType[];
}

export const QuestCureSchema = SchemaFactory.createForClass(QuestCure);
