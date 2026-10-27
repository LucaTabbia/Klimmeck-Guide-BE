import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { CharacterArchiveModule } from 'src/characters/deletion/character-archive.module';
import { CharacterDeletionResolver } from 'src/characters/deletion/character-deletion.resolver';
import { CharacterDeletionService } from 'src/characters/deletion/character-deletion.service';
import { User, UserSchema } from 'src/models/user.model';
import { UsersModule } from 'src/users/users.module';

// modulo sibling della creazione (03.1 D-02), senza Bull
@Module({
    imports: [
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        // archivio condiviso con la morte (Phase 9 C1): posti liberati e aid chiuse
        CharacterArchiveModule,
        UsersModule,
    ],
    providers: [
        CharacterDeletionResolver,
        CharacterDeletionService,
        { provide: Clock, useClass: SystemClock },
    ],
})
export class CharacterDeletionModule {}
