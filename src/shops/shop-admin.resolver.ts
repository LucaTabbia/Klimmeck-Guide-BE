import { Query, Resolver } from '@nestjs/graphql';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';
import { ShopPoolReportEntry } from 'src/models/shop/shop-pool-report.model';
import { ShopPoolReportService } from './shop-pool-report.service';

@Resolver()
export class ShopAdminResolver {
    constructor(private readonly poolReport: ShopPoolReportService) {}

    // innkeeper soltanto, sola lettura: la stessa fonte delle WARN al boot, nessuna correzione (D-06, D-21)
    @Roles(RoleType.innkeeper)
    @Query(() => [ShopPoolReportEntry])
    async shopPoolReport(): Promise<ShopPoolReportEntry[]> {
        return (await this.poolReport.report()).entries;
    }
}
