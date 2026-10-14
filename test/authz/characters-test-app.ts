import { getQueueToken } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthzModule } from 'src/authz/authz.module';
import { CharactersResolver } from 'src/characters/characters.resolver';
import { CharactersService } from 'src/characters/characters.service';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import {
    AuthTestApp,
    AuthTestAppOptions,
    createAuthTestApp,
} from '../auth/auth-test-app';

// CharactersService/Resolver senza CharactersModule (che registra Bull): nessun Redis nei test (Pitfall 8)
export async function createCharactersTestApp(
    options: AuthTestAppOptions = {},
): Promise<AuthTestApp> {
    return createAuthTestApp({
        ...options,
        imports: [
            MongooseModule.forFeature([
                { name: Character.name, schema: CharacterSchema },
                { name: Spell.name, schema: SpellSchema },
                { name: EquipmentItem.name, schema: EquipmentItemSchema },
                { name: LootItem.name, schema: LootItemSchema },
                { name: PointOfInterest.name, schema: PointOfInterestSchema },
            ]),
            AuthzModule,
            ...(options.imports ?? []),
        ],
        providers: [
            CharactersService,
            CharactersResolver,
            {
                provide: getQueueToken('spell-recovery'),
                useValue: { add: jest.fn() },
            },
            ...(options.providers ?? []),
        ],
    });
}
