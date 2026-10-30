export type MixedRefShape = 'scalar' | 'array' | 'subdocArray';

interface MixedRefLocation {
    collection: string;
    path: string;
}

// per subdocArray `path` è l'array di sottodocumenti e `key` (obbligatoria) il campo che contiene il ref
export type MixedRefPath =
    | (MixedRefLocation & { shape: 'scalar' | 'array' })
    | (MixedRefLocation & { shape: 'subdocArray'; key: string });

const WORN_EQUIPMENT_SLOTS = [
    'head',
    'chest',
    'arms',
    'legs',
    'foots',
    'leftHand',
    'rightHand',
    'firstAccessory',
    'secondAccessory',
] as const;

function scalar(collection: string, path: string): MixedRefPath {
    return { collection, path, shape: 'scalar' };
}

function array(collection: string, path: string): MixedRefPath {
    return { collection, path, shape: 'array' };
}

function subdocArray(
    collection: string,
    path: string,
    key: string,
): MixedRefPath {
    return { collection, path, shape: 'subdocArray', key };
}

// i ref che @nestjs/mongoose salva come Mixed (D-17d): la spec dell'inventario li confronta con gli schemi reali
export const MIXED_REF_PATHS: readonly MixedRefPath[] = [
    scalar('users', 'currentCharacter'),
    scalar('pendingquests', 'quest'),
    scalar('characters', 'status.location'),
    array('characters', 'status.spells'),
    array('characters', 'quests.completedQuests'),
    scalar('characters', 'quests.pendingQuest'),
    subdocArray('characters', 'assets.ownedEquipments', 'item'),
    subdocArray('characters', 'assets.ownedItems', 'item'),
    ...WORN_EQUIPMENT_SLOTS.map((slot) =>
        scalar('characters', `assets.wearedEquipment.${slot}`),
    ),
    subdocArray('characters', 'assets.activeSpells', 'spell'),
    scalar('characters', 'assets.pet'),
    scalar('quests', 'infos.enemy'),
    scalar('quests', 'infos.markerLocation'),
    array('quests', 'infos.relatedLore'),
    subdocArray('quests', 'requirements.recommendedLoot', 'item'),
    scalar('quests', 'prizes.prizeItem.item'),
    subdocArray('quests', 'prizes.randomLoot', 'item'),
    scalar('cities', 'markerLocation'),
    scalar('cities', 'relatedLore'),
    scalar('pointsofinterest', 'city'),
    scalar('pointsofinterest', 'quest'),
    array('enemies', 'relatedLore'),
    array('lore', 'relatedLore'),
    scalar('equipmentitems', 'addedSpell'),
    subdocArray('questresults', 'consumablesUsed', 'item'),
    subdocArray('questresults', 'rewards.items', 'item'),
];

export function mixedRefPath(ref: MixedRefPath): string {
    return ref.shape === 'subdocArray' ? `${ref.path}.${ref.key}` : ref.path;
}

export function mixedRefLabel(ref: MixedRefPath): string {
    return `${ref.collection}:${mixedRefPath(ref)}`;
}
