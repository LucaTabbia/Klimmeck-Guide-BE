import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';

// sonda solo-test: mai registrata in src; oggi non esiste alcuna mutation admin (D-15)
@Resolver()
export class AdminProbeResolver {
    @Roles(RoleType.innkeeper)
    @Mutation(() => Boolean)
    adminProbeSucceed(@Args('id') id: string): boolean {
        return id.length > 0;
    }

    @Roles(RoleType.innkeeper)
    @Mutation(() => Boolean)
    adminProbeFail(@Args('id') id: string): boolean {
        throw new Error(`boom ${id}`);
    }

    @Roles(RoleType.innkeeper)
    @Query(() => Boolean)
    adminProbeQuery(): boolean {
        return true;
    }
}
