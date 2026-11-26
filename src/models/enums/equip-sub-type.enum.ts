import { registerEnumType } from '@nestjs/graphql';

// famiglia dell'arma, valorizzata solo con equipType weapon
export enum EquipSubType {
    sword = 'sword',
    greatsword = 'greatsword',
    dagger = 'dagger',
    axe = 'axe',
    greatAxe = 'greatAxe',
    mace = 'mace',
    warHammer = 'warHammer',
    spear = 'spear',
    bow = 'bow',
    shortStaff = 'shortStaff',
    longStaff = 'longStaff',
    wand = 'wand',
    grimoire = 'grimoire',
}

registerEnumType(EquipSubType, { name: 'EquipSubType' });

const TWO_HANDED: ReadonlySet<EquipSubType> = new Set([
    EquipSubType.greatsword,
    EquipSubType.greatAxe,
    EquipSubType.warHammer,
    EquipSubType.spear,
    EquipSubType.bow,
    EquipSubType.longStaff,
]);

// un'arma a due mani occupa entrambe le mani: siede in una e tiene vuota l'altra
export const isTwoHanded = (subType: EquipSubType | null | undefined) =>
    subType != null && TWO_HANDED.has(subType);
