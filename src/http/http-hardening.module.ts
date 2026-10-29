import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RequestIdMiddleware } from 'src/http/request-id.middleware';
import { UnhandledExceptionFilter } from 'src/http/unhandled-exception.filter';

// filtro e middleware come provider Nest (C2): AppModule e harness importano lo stesso modulo
@Module({
    providers: [{ provide: APP_FILTER, useClass: UnhandledExceptionFilter }],
})
export class HttpHardeningModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestIdMiddleware).forRoutes('{*splat}');
    }
}
