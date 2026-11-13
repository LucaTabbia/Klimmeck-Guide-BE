import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import {
    AssetQuantity,
    assetQuantitySchemaAt,
} from '../common/asset-quantity.model';
import { Coins, CoinsSchema } from '../common/coins.model';
import { TitleType } from '../enums/title-type.enum';
import { Pet } from '../pet.model';
import { Spell } from '../spell.model';
import { QuestCure, QuestCureSchema } from './quest-cure.model';

// blocco premio per titolo delle quest di gruppo (D-01, D-05), solo a DB: sul filo lo porta il tipo QuestRankPrizes (D-22, nome quasi uguale)
@Schema({ _id: false })
export class QuestRankPrize {
    @Prop({ type: String, enum: Object.values(TitleType), required: true })
    title: TitleType;

    @Prop({ type: CoinsSchema, default: null })
    prizeCoins?: Coins | null;

    @Prop({ type: Number, default: null })
    xpPrize?: number | null;

    // path assoluti legati ai nomi dei campi di Quest e QuestPrizes: rinominarli richiede di aggiornare anche questi
    @Prop({ type: assetQuantitySchemaAt('prizes.rankPrizes.prizeItem') })
    prizeItem?: AssetQuantity | null;

    @Prop({ type: [assetQuantitySchemaAt('prizes.rankPrizes.randomLoot')] })
    randomLoot: AssetQuantity[];

    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Spell.name,
        default: null,
    })
    spell?: Types.ObjectId | Spell | null;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: Pet.name, default: null })
    pet?: Types.ObjectId | Pet | null;

    @Prop({ type: QuestCureSchema, default: null })
    cure?: QuestCure | null;
}

export const QuestRankPrizeSchema =
    SchemaFactory.createForClass(QuestRankPrize);
