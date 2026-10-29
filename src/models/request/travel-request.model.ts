import { Field, InputType } from '@nestjs/graphql';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

// il client manda solo il personaggio e la meta (D-11, D-18): percorso, durata e velocità sono del server
@InputType()
export class TravelRequest {
    @Field(() => String)
    @IsObjectIdHex()
    id: string;

    @Field(() => String)
    @IsObjectIdHex()
    poiId: string;
}
