import { Field, Float, ObjectType } from '@nestjs/graphql';
import { TravelPath } from './character/active-travel.model';

// anteprima del viaggio libero (D-11): duration in ms, distance in km di gioco
@ObjectType()
export class TravelPreview {
    @Field(() => Float)
    distance: number;

    @Field(() => Float)
    duration: number;

    @Field(() => TravelPath)
    road: TravelPath;
}
