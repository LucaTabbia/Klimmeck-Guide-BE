import { registerEnumType } from '@nestjs/graphql';

export enum UseType {
    defense = 'defense',
    attack = 'attack',
    control = 'control',
    illusion = 'illusion',
    charm = 'charm',
    confuse = 'confuse',
    enhance = 'enhance',
    infuse = 'infuse',
    heal = 'heal',
}

registerEnumType(UseType, { name: 'UseType' });
