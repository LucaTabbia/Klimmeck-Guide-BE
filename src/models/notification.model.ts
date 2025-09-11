import { ObjectType, Field, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@ObjectType()
@Schema()
export class KGNotification {
    @Field(() => String)
    @Prop({ required: true })
    title: string;

    @Field(() => String)
    @Prop({ required: true })
    description: string;
}

export type KGNotificationDocument = KGNotification & Document;
export const KGNotificationSchema = SchemaFactory.createForClass(KGNotification);


@InputType()
export class KGNotificationInput {
    @Field(() => String)
    title: string;

    @Field(() => String)
    description: string;
}
