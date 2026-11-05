import { registerEnumType } from '@nestjs/graphql';

// fasi in cui un gioiello agisce (D-23, D-24): la semantica appartiene al motore di combattimento dell'utente
export enum AccessoryUseType {
    attack = 'attack',
    defense = 'defense',
}

registerEnumType(AccessoryUseType, { name: 'AccessoryUseType' });
