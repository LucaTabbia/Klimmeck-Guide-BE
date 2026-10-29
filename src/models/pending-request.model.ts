import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ActiveTravel } from './character/active-travel.model';
import { AwaitingAid } from './character/awaiting-aid.model';
import { QuestPartySlot } from './quest/quest-party-slot.model';
import { QuestRegistration } from './quest/quest-registration.model';

// read model della coda del GM (D-22): piatto, costruito da letture lean, nessun populate del personaggio
@ObjectType()
export class PendingRequestQuest {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    type: string;

    @Field(() => String)
    title: string;

    @Field(() => [QuestPartySlot])
    requiredAdventurers: QuestPartySlot[];

    @Field(() => [QuestRegistration])
    registeredAdventurers: QuestRegistration[];
}

@ObjectType()
export class PendingRequestCharacter {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    name: string;

    @Field(() => String)
    title: string;

    @Field(() => ID)
    location: string;

    @Field(() => ActiveTravel, { nullable: true })
    activeTravel: ActiveTravel | null;

    @Field(() => AwaitingAid, { nullable: true })
    awaitingAid: AwaitingAid | null;

    // id della missione della corsia standard, null se libera (D-23): il pannello nasconde chi è impegnato
    @Field(() => ID, { nullable: true })
    pendingQuest: string | null;
}

@ObjectType()
export class PendingRequestUser {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    twitchId: string;
}

@ObjectType()
export class PendingRequest {
    @Field(() => ID)
    id: string;

    @Field(() => Date, { nullable: true })
    startDate: Date | null;

    @Field(() => Int)
    pointsSpent: number;

    @Field(() => PendingRequestQuest)
    quest: PendingRequestQuest;

    @Field(() => PendingRequestCharacter)
    character: PendingRequestCharacter;

    @Field(() => PendingRequestUser)
    user: PendingRequestUser;
}
