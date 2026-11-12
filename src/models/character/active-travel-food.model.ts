import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// piano del cibo salvato alla partenza (Phase 20 D-05, D-13): interno come kind e ambush, mai sul filo
@Schema({ _id: false })
export class ActiveTravelFood {
    @Prop({ type: Number, required: true })
    needed: number;

    @Prop({ type: Number, required: true })
    uncoveredKm: number;

    @Prop({ type: Number, required: true })
    coveredKm: number;

    @Prop({ type: Number, required: true })
    hpLostTotal: number;

    @Prop({ type: Number, required: true, default: 0 })
    settledKm: number;

    @Prop({ type: Date, default: null })
    foodConsumedAt: Date | null;
}

export const ActiveTravelFoodSchema =
    SchemaFactory.createForClass(ActiveTravelFood);
