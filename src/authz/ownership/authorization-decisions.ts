import { Injectable } from '@nestjs/common';
import type { GraphQLResolveInfo } from 'graphql';
import type { OnBehalfTarget } from 'src/authz/ownership/owned-resource';

// guard e interceptor ricevono lo stesso info per campo: più mutation aliasate nella stessa operazione
// condividono req, quindi la chiave è info (WeakMap: nessuna pulizia manuale)
@Injectable()
export class AuthorizationDecisions {
    private readonly onBehalf = new WeakMap<
        GraphQLResolveInfo,
        OnBehalfTarget
    >();

    recordOnBehalf(info: GraphQLResolveInfo, target: OnBehalfTarget): void {
        this.onBehalf.set(info, target);
    }

    onBehalfTargetOf(info: GraphQLResolveInfo): OnBehalfTarget | undefined {
        return this.onBehalf.get(info);
    }
}
