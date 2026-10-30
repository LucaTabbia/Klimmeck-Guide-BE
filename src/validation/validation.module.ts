import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { createValidationPipe } from 'src/validation/validation-pipe.factory';

// pipe globale registrata come provider (C2): main.ts non gira nei test; AppModule e harness importano lo stesso modulo (piano 10-08)
@Module({
    providers: [{ provide: APP_PIPE, useFactory: createValidationPipe }],
})
export class ValidationModule {}
