import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { Enemy } from '../enemy.model';

// una voce per tipo di nemico (D-01): nelle dungeon l'ordine della lista è l'ordine delle tappe (D-12)
@ObjectType()
@Schema({ _id: false })
export class QuestEnemy {
    @Field(() => Enemy)
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Enemy.name,
        required: true,
    })
    enemy: Types.ObjectId | Enemy;

    @Field(() => Int)
    @Prop({ type: Number, required: true, min: 1 })
    quantity: number;
}

export const QuestEnemySchema = SchemaFactory.createForClass(QuestEnemy);
