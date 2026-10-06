import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

bootstrap().catch((error: Error) => {
    new Logger('Bootstrap').error(error.message);
    process.exit(1);
});
