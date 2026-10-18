import { Field, Int, ObjectType } from '@nestjs/graphql';
import { PushDeliveryCounts } from 'src/push/push-delivery';

// nessun codice d'errore aggregato: i codici FCM restano nei log (RESEARCH OQ6)
@ObjectType()
export class PushDeliveryReport implements PushDeliveryCounts {
    @Field(() => Int)
    targeted: number;

    @Field(() => Int)
    sent: number;

    @Field(() => Int)
    pruned: number;

    @Field(() => Int)
    failed: number;
}
