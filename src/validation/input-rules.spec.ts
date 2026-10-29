import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCharacterInput } from 'src/models/request/create-character-request.model';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';
import { EquipSpellRequest } from 'src/models/request/equip-spell-request.model';
import { TransactionRequest } from 'src/models/request/transaction-request.model';
import { UseSpellRequest } from 'src/models/request/use-spell-request.model';
import { invalidFieldsOf } from 'src/validation/invalid-fields';

const CHARACTER_ID = '64b000000000000000000001';
const ITEM_ID = '64b000000000000000000002';
const SPELL_ID = '64b000000000000000000003';

const VALIDATION_OPTIONS = { whitelist: true, forbidUnknownValues: false };

async function fieldsOf(
    target: new () => object,
    plain: object,
): Promise<string[]> {
    const instance = plainToInstance(target, plain);
    return invalidFieldsOf(await validate(instance, VALIDATION_OPTIONS));
}

const assetLine = (quantity: number, item: string | null = ITEM_ID) => ({
    item,
    quantity,
});

const transaction = (overrides: object = {}) => ({
    id: CHARACTER_ID,
    boughtItems: { lootAssets: [], equipAssets: [] },
    soldItems: { lootAssets: [], equipAssets: [] },
    total: { gold: 0, silver: 1, copper: 2 },
    isTotalPositive: true,
    ...overrides,
});

const character = (overrides: object = {}) => ({
    name: 'Aria',
    sex: 'female',
    pronoun: 'she',
    race: 'elf',
    classType: 'bard',
    age: 120,
    background: null,
    imagePath: null,
    ...overrides,
});

describe('input rules', () => {
    describe('economy and equipment', () => {
        it('rejects a negative transaction quantity (D-04)', async () => {
            const plain = transaction({
                boughtItems: { lootAssets: [assetLine(-1)], equipAssets: [] },
            });

            expect(await fieldsOf(TransactionRequest, plain)).toEqual([
                'boughtItems.lootAssets.0.quantity',
            ]);
        });

        it('leaves a zero quantity to the domain rule (D-04, C5)', async () => {
            const plain = transaction({
                boughtItems: { lootAssets: [assetLine(0)], equipAssets: [] },
            });

            expect(await fieldsOf(TransactionRequest, plain)).toEqual([]);
        });

        it('rejects a malformed item id in a transaction (D-02)', async () => {
            const plain = transaction({
                soldItems: {
                    lootAssets: [],
                    equipAssets: [assetLine(1, 'abc')],
                },
            });

            expect(await fieldsOf(TransactionRequest, plain)).toEqual([
                'soldItems.equipAssets.0.item',
            ]);
        });

        it('caps transaction lines at 100 (D-04)', async () => {
            const lines = Array.from({ length: 101 }, () => assetLine(1));
            const plain = transaction({
                boughtItems: { lootAssets: lines, equipAssets: [] },
            });

            expect(await fieldsOf(TransactionRequest, plain)).toEqual([
                'boughtItems.lootAssets',
            ]);
        });

        it('rejects negative coins in a transaction total (D-04)', async () => {
            const plain = transaction({
                total: { gold: 0, silver: 0, copper: -1 },
            });

            expect(await fieldsOf(TransactionRequest, plain)).toEqual([
                'total.copper',
            ]);
        });

        it('rejects a malformed item id when equipping (D-02)', async () => {
            const equip = { id: CHARACTER_ID, slotType: 'chest' };

            expect(
                await fieldsOf(EquipItemRequest, { ...equip, itemId: 'abc' }),
            ).toEqual(['itemId']);
            expect(await fieldsOf(EquipItemRequest, equip)).toEqual([]);
        });

        it('rejects a malformed spell id when equipping or using a spell (D-02)', async () => {
            expect(
                await fieldsOf(EquipSpellRequest, {
                    id: CHARACTER_ID,
                    spellId: 'abc',
                }),
            ).toEqual(['spellId']);
            expect(
                await fieldsOf(UseSpellRequest, {
                    characterId: CHARACTER_ID,
                    spellId: 'abc',
                }),
            ).toEqual(['spellId']);
        });

        it('strips the deprecated usages of an equipped spell (D-01)', async () => {
            const instance = plainToInstance(EquipSpellRequest, {
                id: CHARACTER_ID,
                spellId: SPELL_ID,
                usages: 3,
            });

            expect(await validate(instance, VALIDATION_OPTIONS)).toEqual([]);
            expect(Object.keys(instance).sort()).toEqual(['id', 'spellId']);
        });
    });

    describe('character creation', () => {
        it('checks only the shape of the character creation fields (C4)', async () => {
            const domainDecides = [
                character({ name: 'A' }),
                character({ name: 'A'.repeat(40) }),
                character({ background: 'b'.repeat(600) }),
                character({ imagePath: 'http://example.test/face.png' }),
            ];

            for (const plain of domainDecides) {
                expect(await fieldsOf(CreateCharacterInput, plain)).toEqual([]);
            }
            expect(
                await fieldsOf(
                    CreateCharacterInput,
                    character({ race: 'dragon' }),
                ),
            ).toEqual(['race']);
            expect(
                await fieldsOf(CreateCharacterInput, character({ age: 'x' })),
            ).toEqual(['age']);
        });
    });
});
