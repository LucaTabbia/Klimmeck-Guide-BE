import { Module } from '@nestjs/common';
import { Clock, SystemClock } from 'src/auth/clock';
import { ServerTimeResolver } from 'src/time/server-time.resolver';

@Module({
    providers: [ServerTimeResolver, { provide: Clock, useClass: SystemClock }],
})
export class ServerTimeModule {}
