import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { TravelPath } from './character/active-travel.model';
import { TravelFoodItem } from './travel-food-item.model';

// anteprima del viaggio libero (D-11): duration in ms, distance in km di gioco; più cibo, vita persa e arrivo vivo (Phase 14 D-09): mai il codice di fame
@ObjectType()
export class TravelPreview {
    @Field(() => Float)
    distance: number;

    @Field(() => Float)
    duration: number;

    @Field(() => TravelPath)
    road: TravelPath;

    @Field(() => [TravelFoodItem])
    food: TravelFoodItem[];

    @Field(() => Int)
    hpLost: number;

    @Field(() => Boolean)
    arrivesAlive: boolean;
}
