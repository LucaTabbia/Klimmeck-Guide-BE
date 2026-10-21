import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
    AssetQuantity,
    AssetQuantityInput,
    AssetQuantitySchema,
} from '../common/asset-quantity.model';
import { TitleType } from '../enums/title-type.enum';
import {
    QuestPartySlot,
    QuestPartySlotInput,
    QuestPartySlotSchema,
} from './quest-party-slot.model';

@ObjectType()
@Schema({ _id: false })
export class QuestRequirements {
    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    requiredPoints?: number | null;

    // capienza delle quest registrate (worldMission, boss, enemy, aid): totale = Σ count; ignorata dagli altri tipi (D-27, D-28b)
    @Field(() => [QuestPartySlot])
    @Prop({ type: [QuestPartySlotSchema], default: [] })
    requiredAdventurers: QuestPartySlot[];

    @Field(() => [AssetQuantity])
    @Prop({ type: [AssetQuantitySchema], default: [] })
    recommendedLoot: AssetQuantity[];

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(TitleType) })
    minTitle: TitleType;
}

export type QuestRequirementsDocument = QuestRequirements & Document;
export const QuestRequirementsSchema =
    SchemaFactory.createForClass(QuestRequirements);

@InputType()
export class QuestRequirementsInput {
    @Field(() => Int, { nullable: true })
    requiredPoints?: number | null;

    @Field(() => [QuestPartySlotInput], { nullable: true })
    requiredAdventurers?: QuestPartySlotInput[];

    @Field(() => [AssetQuantityInput], { nullable: true })
    recommendedLoot?: AssetQuantityInput[];

    @Field(() => TitleType)
    minTitle: TitleType;
}
