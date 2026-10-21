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

    @Field(() => Int)
    @Prop({ type: Number })
    requiredAdventurers: number;

    @Field(() => [AssetQuantity])
    @Prop({ type: [AssetQuantitySchema], default: [] })
    recommendedLoot: AssetQuantity[];

    // vuoto = dato legacy: capienza = requiredAdventurers totale se > 0, altrimenti nessun limite (D-04)
    @Field(() => [QuestPartySlot])
    @Prop({ type: [QuestPartySlotSchema], default: [] })
    party: QuestPartySlot[];

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

    @Field(() => Int)
    requiredAdventurers: number;

    @Field(() => [AssetQuantityInput], { nullable: true })
    recommendedLoot?: AssetQuantityInput[];

    @Field(() => [QuestPartySlotInput], { nullable: true })
    party?: QuestPartySlotInput[];

    @Field(() => TitleType)
    minTitle: TitleType;
}
