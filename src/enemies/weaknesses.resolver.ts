import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Weaknesses } from 'src/models/common/weaknesses.model';
import { DamageType } from 'src/models/enums/damage-type.enum';
import { EnergyType } from 'src/models/enums/energy-type.enum';
import { knownDamageTypesOf, knownEnergyTypesOf } from './known-weaknesses';

// un valore fuori enum scritto a DB senza validatori annullerebbe il nemico e ogni lista che lo contiene: sul filo si toglie (Phase 19 D-01)
@Resolver(() => Weaknesses)
export class WeaknessesResolver {
    @ResolveField('base', () => [DamageType])
    base(@Parent() weaknesses: Weaknesses): DamageType[] {
        return knownDamageTypesOf(weaknesses.base);
    }

    @ResolveField('energy', () => [EnergyType])
    energy(@Parent() weaknesses: Weaknesses): EnergyType[] {
        return knownEnergyTypesOf(weaknesses.energy);
    }
}
