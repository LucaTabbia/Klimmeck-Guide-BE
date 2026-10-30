import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
    CharacterInfosSchema,
    CharacterInfos,
    CharacterInfosInput,
} from './character-infos.model';
import {
    CharacterStatusSchema,
    CharacterStatus,
    CharacterStatusInput,
} from './character-status.model';
import {
    CharacterQuestsSchema,
    CharacterQuests,
    CharacterQuestsInput,
} from './character-quests.model';
import {
    CharacterAssetsSchema,
    CharacterAssets,
    CharacterAssetsInput,
} from './character-assets.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';

@ObjectType()
@Schema()
export class Character {
    @Field(() => ID)
    id: string;

    @Field(() => CharacterInfos)
    @Prop({ type: CharacterInfosSchema })
    infos: CharacterInfos;

    @Field(() => CharacterStatus)
    @Prop({ type: CharacterStatusSchema })
    status: CharacterStatus;

    @Field(() => CharacterQuests)
    @Prop({ type: CharacterQuestsSchema })
    quests: CharacterQuests;

    @Field(() => CharacterAssets)
    @Prop({ type: CharacterAssetsSchema })
    assets: CharacterAssets;

    // archivio (soft delete, D-04): mai esposto in GraphQL; type esplicito, altrimenti Date | null diventa Mixed
    @Prop({ type: Date, default: null })
    deletedAt: Date | null;

    @Prop({ type: String, enum: Object.values(DeletionReason), default: null })
    deletionReason: DeletionReason | null;
}

export type CharacterDocument = Character & Document;
export const CharacterSchema = SchemaFactory.createForClass(Character);

export const CHARACTER_NAME_INDEX = 'character_name_active_ci_unique';
// indice globale della 02.1: il verifier lo elimina al primo boot (stesso nome con nuove opzioni → code 86)
export const LEGACY_CHARACTER_NAME_INDEX = 'character_name_ci_unique';
export const CHARACTER_NAME_COLLATION = { locale: 'en', strength: 2 } as const;

// unicità case-insensitive garantita dal DB (D-18) solo tra i personaggi attivi (D-09):
// strength 2 ignora maiuscole, non gli accenti; { deletedAt: null } copre anche i documenti senza il campo
CharacterSchema.index(
    { 'infos.name': 1 },
    {
        unique: true,
        collation: CHARACTER_NAME_COLLATION,
        name: CHARACTER_NAME_INDEX,
        partialFilterExpression: ACTIVE_CHARACTER_FILTER,
    },
);

export const CHARACTER_STANDARD_LANE_INDEX = 'character_standard_lane';
export const CHARACTER_AWAITING_AID_SINCE_INDEX =
    'character_awaiting_aid_since';
export const CHARACTER_ACTIVE_TRAVEL_END_INDEX = 'character_active_travel_end';
export const CHARACTER_SPELL_RECOVERIES_INDEX = 'character_spell_recoveries';

// serve le letture della corsia standard, l'archivio e il publisher dell'avvio (D-17b)
CharacterSchema.index(
    { deletedAt: 1, 'quests.pendingQuest': 1 },
    { name: CHARACTER_STANDARD_LANE_INDEX },
);
// serve lo sweep dei soccorsi scaduti (D-17b)
CharacterSchema.index(
    { deletedAt: 1, 'status.awaitingAid.since': 1 },
    { name: CHARACTER_AWAITING_AID_SINCE_INDEX },
);
// serve lo sweep dei viaggi scaduti (D-17b)
CharacterSchema.index(
    { deletedAt: 1, 'status.activeTravel.endTime': 1 },
    { name: CHARACTER_ACTIVE_TRAVEL_END_INDEX },
);
// serve lo sweep dei recuperi delle magie, una voce per recupero (D-17b)
CharacterSchema.index(
    { deletedAt: 1, 'status.spellStates.recoveries': 1 },
    { name: CHARACTER_SPELL_RECOVERIES_INDEX },
);

@InputType()
export class CharacterInput {
    @Field(() => ID, { nullable: true })
    id?: string | null;

    @Field(() => CharacterInfosInput)
    infos: CharacterInfosInput;

    @Field(() => CharacterStatusInput)
    status: CharacterStatusInput;

    @Field(() => CharacterQuestsInput)
    quests: CharacterQuestsInput;

    @Field(() => CharacterAssetsInput)
    assets: CharacterAssetsInput;
}
