import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AbandonQuestRequest } from 'src/models/request/abandon-quest-request.model';
import { AcceptQuestRequest } from 'src/models/request/accept-quest-request.model';
import { CompletePendingRequestInput } from 'src/models/request/complete-pending-request.model';
import { CreateCharacterInput } from 'src/models/request/create-character-request.model';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';
import { EquipSpellRequest } from 'src/models/request/equip-spell-request.model';
import { TransactionRequest } from 'src/models/request/transaction-request.model';
import { TravelRequest } from 'src/models/request/travel-request.model';
import { UseSpellRequest } from 'src/models/request/use-spell-request.model';
import { RegisterPushDeviceInput } from 'src/push/dto/register-push-device.input';
import { SendTestPushInput } from 'src/push/dto/send-test-push.input';
import { invalidFieldsOf } from 'src/validation/invalid-fields';

const CHARACTER_ID = '64b000000000000000000001';
const ITEM_ID = '64b000000000000000000002';
const SPELL_ID = '64b000000000000000000003';
const QUEST_ID = '64b000000000000000000004';
const PENDING_QUEST_ID = '64b000000000000000000005';

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

const completion = (outcome: object = {}, extraOutcomes: object[] = []) => ({
    pendingQuestId: PENDING_QUEST_ID,
    outcomes: [{ characterId: CHARACTER_ID, ...outcome }, ...extraOutcomes],
});

const pushDevice = (overrides: object = {}) => ({
    deviceId: 'fake-device-1',
    token: 'fake-push-token',
    platform: 'android',
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

    describe('quests and travel', () => {
        it('rejects malformed quest and travel ids (D-02)', async () => {
            const quest = { id: CHARACTER_ID, questId: 'abc' };

            expect(await fieldsOf(AcceptQuestRequest, quest)).toEqual([
                'questId',
            ]);
            expect(await fieldsOf(AbandonQuestRequest, quest)).toEqual([
                'questId',
            ]);
            expect(
                await fieldsOf(TravelRequest, {
                    id: CHARACTER_ID,
                    poiId: 'abc',
                }),
            ).toEqual(['poiId']);
            expect(
                await fieldsOf(AcceptQuestRequest, {
                    id: CHARACTER_ID,
                    questId: QUEST_ID,
                }),
            ).toEqual([]);
        });
    });

    describe('gm completion overrides', () => {
        it('rejects a malformed override participant id (D-02, C5)', async () => {
            const plain = completion({ characterId: 'abc' });

            expect(await fieldsOf(CompletePendingRequestInput, plain)).toEqual([
                'outcomes.0.characterId',
            ]);
        });

        it('rejects negative override numbers and leaves zero to the domain (D-04, C5)', async () => {
            expect(
                await fieldsOf(
                    CompletePendingRequestInput,
                    completion({ hpAfter: -1 }),
                ),
            ).toEqual(['outcomes.0.hpAfter']);
            expect(
                await fieldsOf(
                    CompletePendingRequestInput,
                    completion({ hpAfter: 0 }),
                ),
            ).toEqual([]);
            expect(
                await fieldsOf(
                    CompletePendingRequestInput,
                    completion({
                        consumablesUsed: [{ item: ITEM_ID, quantity: -2 }],
                        spellsUsed: [{ spell: SPELL_ID, usages: 0 }],
                    }),
                ),
            ).toEqual(['outcomes.0.consumablesUsed.0.quantity']);
        });

        it('keeps the Phase 9 cap of 50 override entries (C5)', async () => {
            const extra = Array.from({ length: 50 }, () => ({
                characterId: CHARACTER_ID,
            }));
            const injuries = Array.from({ length: 51 }, () => 'blindness');

            expect(
                await fieldsOf(
                    CompletePendingRequestInput,
                    completion({}, extra),
                ),
            ).toEqual(['outcomes']);
            expect(
                await fieldsOf(
                    CompletePendingRequestInput,
                    completion({ injuries }),
                ),
            ).toEqual(['outcomes.0.injuries']);
            expect(
                await fieldsOf(
                    CompletePendingRequestInput,
                    completion({}, extra.slice(1)),
                ),
            ).toEqual([]);
        });

        it('rejects an unknown injury (D-04)', async () => {
            expect(
                await fieldsOf(
                    CompletePendingRequestInput,
                    completion({ injuries: ['nope'] }),
                ),
            ).toEqual(['outcomes.0.injuries']);
        });
    });

    describe('push', () => {
        it('checks only the shape of the push device fields (C4)', async () => {
            expect(
                await fieldsOf(
                    RegisterPushDeviceInput,
                    pushDevice({ deviceId: 'fake device with spaces' }),
                ),
            ).toEqual([]);
            expect(
                await fieldsOf(
                    RegisterPushDeviceInput,
                    pushDevice({ deviceId: 'd'.repeat(300) }),
                ),
            ).toEqual([]);
            expect(
                await fieldsOf(
                    RegisterPushDeviceInput,
                    pushDevice({ platform: 'symbian' }),
                ),
            ).toEqual(['platform']);
        });

        it('caps the free text of the test push at 2000 characters (D-04)', async () => {
            expect(
                await fieldsOf(SendTestPushInput, {
                    type: 'questEnd',
                    id: 'x'.repeat(2001),
                }),
            ).toEqual(['id']);
            expect(
                await fieldsOf(SendTestPushInput, {
                    type: 'questEnd',
                    targetUserId: 'abc',
                }),
            ).toEqual(['targetUserId']);
            expect(
                await fieldsOf(SendTestPushInput, {
                    type: 'questEnd',
                    id: 'x'.repeat(2000),
                }),
            ).toEqual([]);
        });
    });
});
