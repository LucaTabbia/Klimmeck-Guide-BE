import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
    // rawBody: il webhook EventSub verifica l'HMAC sui byte grezzi (06 D-02)
    const app = await NestFactory.create(AppModule, { rawBody: true });
    const config = app.get(ConfigService);
    await app.listen(config.get<string>('PORT') ?? 3000, '0.0.0.0');
}

bootstrap().catch((error: Error) => {
    new Logger('Bootstrap').error(error.message);
    process.exit(1);
});
