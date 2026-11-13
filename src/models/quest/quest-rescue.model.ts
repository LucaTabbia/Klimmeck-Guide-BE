import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { DungeonTurnKind } from '../enums/dungeon-turn-kind.enum';

// turno della sconfitta in una dungeon (D-12, D-20): indice 0-based sul totale dell'intera dungeon, riletto solo tramite rescueTurnOf
@Schema({ _id: false })
export class QuestRescueTurn {
    @Prop({ type: Number, required: true, min: 0 })
    index: number;

    @Prop({
        type: String,
        enum: Object.values(DungeonTurnKind),
        required: true,
    })
    kind: DungeonTurnKind;

    @Prop({ type: Number, required: true, min: 1 })
    total: number;
}

export const QuestRescueTurnSchema =
    SchemaFactory.createForClass(QuestRescueTurn);

// riferimento di soccorso della aid automatica (D-08): mai sul filo, i feriti si collegano con status.awaitingAid.aidQuest
@Schema({ _id: false })
export class QuestRescue {
    // tutti i feriti del combattimento perso (decisione utente 2026-10-25): una sola aid per combattimento
    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: 'Character',
        required: true,
        default: undefined,
    })
    characters: Types.ObjectId[];

    // quest del primo combattimento perso: una catena clona sempre l'originale (D-09)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Quest', required: true })
    failedQuest: Types.ObjectId;

    // solo sull'aid di una dungeon: la sua presenza dice «aid di dungeon» (D-20)
    @Prop({ type: QuestRescueTurnSchema, default: undefined })
    turn?: QuestRescueTurn;
}

export const QuestRescueSchema = SchemaFactory.createForClass(QuestRescue);
