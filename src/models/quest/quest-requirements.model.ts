import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AssetQuantity, AssetQuantityInput, AssetQuantitySchema } from '../common/asset-quantity.model';
import { TitleType } from '../enums/title-type.enum';

@ObjectType()
@Schema({ _id: false })
export class QuestRequirements {
    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    requiredPoints?: number | null;

    @Field(() => Int)
    @Prop({ type: Number })
    requiredAdventurers: number;

    @Field(() => [AssetQuantity])
    @Prop({ type: [AssetQuantitySchema], default: [] })
    recommendedLoot: AssetQuantity[];

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(TitleType) })
    minTitle: TitleType;
}

export type QuestRequirementsDocument = QuestRequirements & Document;
export const QuestRequirementsSchema = SchemaFactory.createForClass(QuestRequirements);

@InputType()
export class QuestRequirementsInput {
    @Field(() => Int, { nullable: true })
    requiredPoints?: number | null;

    @Field(() => Int)
    requiredAdventurers: number;

    @Field(() => [AssetQuantityInput], { nullable: true })
    recommendedLoot?: AssetQuantityInput[];

    @Field(() => TitleType)
    minTitle: TitleType;
}

