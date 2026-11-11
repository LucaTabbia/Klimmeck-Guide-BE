import { Module } from '@nestjs/common';
import { WeaknessesResolver } from './weaknesses.resolver';

// importato da ogni modulo che serve un nemico sul filo: gli harness montano un modulo alla volta
@Module({ providers: [WeaknessesResolver] })
export class WeaknessesModule {}
