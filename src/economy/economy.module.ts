import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletService } from 'src/economy/wallet.service';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { User, UserSchema } from 'src/models/user.model';

// unico scrittore dei saldi (04 D-04): coins del personaggio e twitchPoints dell'utente
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    providers: [WalletService],
    exports: [WalletService],
})
export class EconomyModule {}
