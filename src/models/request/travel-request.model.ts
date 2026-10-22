import { Field, InputType } from '@nestjs/graphql';

// il client manda solo il personaggio e la meta (D-11, D-18): percorso, durata e velocità sono del server
@InputType()
export class TravelRequest {
    @Field(() => String)
    id: string;

    @Field(() => String)
    poiId: string;
}
