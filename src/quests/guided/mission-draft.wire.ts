import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Coins } from 'src/models/common/coins.model';
import { Enemy } from 'src/models/enemy.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { LootItem } from 'src/models/loot-item.model';
import { Pet } from 'src/models/pet.model';
import { QuestCure } from 'src/models/quest/quest-cure.model';
import { QuestPrizes } from 'src/models/quest/quest-prizes.model';
import { Spell } from 'src/models/spell.model';
import type { PrizesSnapshot } from 'src/quests/outcomes/rewards/quest-rewards';
import { MissionDraftStep, MissionFightVerdict } from './mission-draft.model';

// filo della bozza (D-17): classi distinte dallo schema Mongoose, id esadecimali e nemici popolati

registerEnumType(MissionDraftStep, { name: 'MissionDraftStep' });
registerEnumType(MissionFightVerdict, { name: 'MissionFightVerdict' });

@ObjectType()
export class MissionItemUsage {
    @Field(() => ID)
    item: string;

    @Field(() => Int)
    quantity: number;
}

@ObjectType()
export class MissionSpellUsage {
    @Field(() => ID)
    spell: string;

    @Field(() => Int)
    usages: number;
}

@ObjectType()
export class MissionFightEffects {
    @Field(() => Int)
    hpAfter: number;

    @Field(() => [InjuryType])
    injuriesAdded: InjuryType[];

    @Field(() => [MissionItemUsage])
    consumablesUsed: MissionItemUsage[];

    @Field(() => [MissionSpellUsage])
    spellsUsed: MissionSpellUsage[];
}

@ObjectType()
export class MissionFightEnemy {
    @Field(() => Enemy)
    enemy: Enemy;

    @Field(() => Int)
    quantity: number;
}

@ObjectType()
export class MissionFightOutcome {
    @Field(() => ID)
    character: string;

    @Field(() => Int)
    hpBefore: number;

    @Field(() => [InjuryType])
    injuriesBefore: InjuryType[];

    @Field(() => [MissionItemUsage])
    consumablesAvailable: MissionItemUsage[];

    @Field(() => [MissionSpellUsage])
    spellsAvailable: MissionSpellUsage[];

    @Field(() => MissionFightEffects, { nullable: true })
    simulated: MissionFightEffects | null;

    @Field(() => MissionFightEffects, { nullable: true })
    corrected: MissionFightEffects | null;
}

@ObjectType()
export class MissionFight {
    @Field(() => [MissionFightEnemy])
    enemies: MissionFightEnemy[];

    @Field(() => MissionFightVerdict, { nullable: true })
    verdict: MissionFightVerdict | null;

    @Field(() => [MissionFightOutcome])
    outcomes: MissionFightOutcome[];
}

@ObjectType()
export class MissionParticipant {
    @Field(() => ID)
    character: string;

    @Field(() => ID)
    pendingQuest: string;

    @Field(() => String)
    name: string;

    @Field(() => String)
    title: string;

    @Field(() => Int)
    maxLifePoints: number;
}

@ObjectType()
export class MissionPrizeItem {
    @Field(() => ID)
    item: string;

    @Field(() => Int)
    quantity: number;
}

@ObjectType()
export class MissionPrize {
    @Field(() => ID)
    character: string;

    @Field(() => Coins)
    coins: Coins;

    @Field(() => Int)
    xp: number;

    @Field(() => [MissionPrizeItem])
    items: MissionPrizeItem[];

    @Field(() => ID, { nullable: true })
    pet: string | null;

    @Field(() => ID, { nullable: true })
    spell: string | null;

    @Field(() => QuestCure, { nullable: true })
    cure: QuestCure | null;
}

@ObjectType('MissionDraft')
export class MissionDraftView {
    @Field(() => ID)
    id: string;

    @Field(() => ID)
    quest: string;

    @Field(() => String)
    questType: string;

    @Field(() => MissionDraftStep)
    step: MissionDraftStep;

    @Field(() => ID, { nullable: true })
    place: string | null;

    @Field(() => [MissionParticipant])
    participants: MissionParticipant[];

    @Field(() => [MissionFight])
    fights: MissionFight[];

    @Field(() => [MissionPrize])
    prizes: MissionPrize[];

    @Field(() => Date)
    startedAt: Date;

    @Field(() => Date)
    updatedAt: Date;
}

// premi ammessi per un partecipante (D-07, D-22): blocco del titolo com'è, catalogo filtrato dalla stessa regola della rivalidazione
@ObjectType('MissionPrizeOptions')
export class MissionPrizeOptionsView {
    @Field(() => QuestPrizes)
    block: PrizesSnapshot;

    @Field(() => ID)
    character: string;

    @Field(() => [EquipmentItem])
    equipment: EquipmentItem[];

    @Field(() => [LootItem])
    loot: LootItem[];

    @Field(() => RarityType)
    maxRarity: RarityType;

    @Field(() => [Pet])
    pets: Pet[];

    @Field(() => [Spell])
    spells: Spell[];

    @Field(() => String)
    title: string;
}
