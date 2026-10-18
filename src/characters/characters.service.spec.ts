import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Character } from 'src/models/character/character.model';
import { SlotType } from 'src/models/enums/slot_type.enum';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';
import { TransactionRequest } from 'src/models/request/transaction-request.model';
import { Spell } from 'src/models/spell.model';
import { buildCharacter, buildSpell } from '../../test/fixtures';
import { CharactersService } from './characters.service';
import {
    ACTIVE_SPELL_SNAPSHOT_PROJECTION,
    equipSpellFilter,
    equipSpellUpdate,
    unequipSpellFilter,
    unequipSpellUpdate,
} from './spells/active-spell.updates';

/**
 * UNIT: CharactersService spell mutations with the Bull queue mocked at the DI
 * boundary (getQueueToken) — no Redis, no replSet. The Mongoose models are
 * replaced with plain jest mocks (getModelToken). onModuleInit is NOT triggered
 * (compile() does not call lifecycle hooks), so the change-stream `.watch` on the
 * mocked model is never exercised here.
 */

const mockQueue = { add: jest.fn() };
const mockCharacterModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
    exists: jest.fn(),
};
const mockSpellModel = { findById: jest.fn() };
const mockPubSub = { publish: jest.fn(), subscribe: jest.fn() };

/**
 * Build a plain character usable against the mocked model. `maxActiveSpells` is a
 * Mongoose virtual at runtime, but a plain object here — so we set it explicitly.
 * A `save` jest.fn() lets us assert (non-)persistence.
 */
function makeCharacter(overrides: Record<string, any> = {}) {
    const character: any = buildCharacter(overrides);
    if (character.status.maxActiveSpells === undefined) {
        character.status.maxActiveSpells = 1;
    }
    character.save = jest.fn().mockResolvedValue(undefined);
    return character;
}

/** Mongoose findOne(...).exec() shape. */
function asQuery(doc: any) {
    return { exec: jest.fn().mockResolvedValue(doc) };
}

/** Mongoose findOne(...).lean().exec() shape. */
function asLeanQuery(doc: any) {
    return {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(doc),
    };
}

/** Mongoose updateOne(...).exec() shape. */
function asUpdate(matchedCount: number) {
    return {
        exec: jest
            .fn()
            .mockResolvedValue({ matchedCount, modifiedCount: matchedCount }),
    };
}

describe('CharactersService (unit — spell mutations)', () => {
    let service: CharactersService;

    beforeEach(async () => {
        jest.clearAllMocks();

        const moduleRef = await Test.createTestingModule({
            providers: [
                CharactersService,
                {
                    provide: getModelToken(Character.name),
                    useValue: mockCharacterModel,
                },
                {
                    provide: getModelToken(Spell.name),
                    useValue: mockSpellModel,
                },
                {
                    provide: getQueueToken('spell-recovery'),
                    useValue: mockQueue,
                },
                { provide: 'PUB_SUB', useValue: mockPubSub },
            ],
        }).compile();

        // resolve without triggering onModuleInit (no change stream on the mock)
        service = moduleRef.get<CharactersService>(CharactersService);
    });

    describe('equipSpell', () => {
        const c = new Types.ObjectId();
        const s = new Types.ObjectId();

        it('equipSpell writes the catalog maxUsages with a single conditional update', async () => {
            mockSpellModel.findById.mockReturnValue(
                asLeanQuery({ maxUsages: 3 }),
            );
            mockCharacterModel.updateOne.mockReturnValue(asUpdate(1));

            const result = await service.equipSpell({
                id: c.toHexString(),
                spellId: s.toHexString(),
                usages: 99,
            });

            expect(result.successful).toBe(true);
            expect(mockCharacterModel.updateOne).toHaveBeenCalledTimes(1);
            const [filter, update] = mockCharacterModel.updateOne.mock.calls[0];
            expect(filter).toEqual(equipSpellFilter(c, s));
            expect(update).toEqual(equipSpellUpdate(s, 3));
            expect(mockCharacterModel.findOne).not.toHaveBeenCalled();
        });

        it('equipSpell looks the spell up first and answers NOT_FOUND when it is missing', async () => {
            mockSpellModel.findById.mockReturnValue(asLeanQuery(null));

            await expect(
                service.equipSpell({
                    id: c.toHexString(),
                    spellId: s.toHexString(),
                }),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(mockCharacterModel.updateOne).not.toHaveBeenCalled();
        });

        it('equipSpell rejects a malformed spell id without touching the database', async () => {
            await expect(
                service.equipSpell({ id: c.toHexString(), spellId: 'abc' }),
            ).rejects.toMatchObject({ code: 'SPELL_NOT_KNOWN' });
            expect(mockSpellModel.findById).not.toHaveBeenCalled();
            expect(mockCharacterModel.updateOne).not.toHaveBeenCalled();
        });

        it('equipSpell classifies a rejected write from a lean reread', async () => {
            mockSpellModel.findById.mockReturnValue(
                asLeanQuery({ maxUsages: 3 }),
            );
            mockCharacterModel.updateOne.mockReturnValue(asUpdate(0));
            mockCharacterModel.findOne.mockReturnValue(
                asLeanQuery({
                    status: { spells: [] },
                    assets: { activeSpells: [] },
                }),
            );

            await expect(
                service.equipSpell({
                    id: c.toHexString(),
                    spellId: s.toHexString(),
                }),
            ).rejects.toMatchObject({ code: 'SPELL_NOT_KNOWN' });
            expect(mockCharacterModel.findOne).toHaveBeenCalledWith(
                { _id: c, deletedAt: null },
                ACTIVE_SPELL_SNAPSHOT_PROJECTION,
            );
        });
    });

    describe('unequipSpell', () => {
        const c = new Types.ObjectId();
        const s = new Types.ObjectId();

        it('unequipSpell pulls the spell with a conditional update', async () => {
            mockCharacterModel.updateOne.mockReturnValue(asUpdate(1));

            const result = await service.unequipSpell({
                id: c.toHexString(),
                spellId: s.toHexString(),
            });

            expect(result.successful).toBe(true);
            const [filter, update] = mockCharacterModel.updateOne.mock.calls[0];
            expect(filter).toEqual(unequipSpellFilter(c, s));
            expect(update).toEqual(unequipSpellUpdate(s));
        });

        it('unequipSpell answers SPELL_NOT_ACTIVE when nothing matched', async () => {
            mockCharacterModel.updateOne.mockReturnValue(asUpdate(0));
            mockCharacterModel.findOne.mockReturnValue(
                asLeanQuery({ status: {}, assets: { activeSpells: [] } }),
            );

            await expect(
                service.unequipSpell({
                    id: c.toHexString(),
                    spellId: s.toHexString(),
                }),
            ).rejects.toMatchObject({ code: 'SPELL_NOT_ACTIVE' });
        });
    });

    describe('useSpell', () => {
        it('decrements usages and schedules recovery (happy path)', async () => {
            const characterId = new Types.ObjectId().toString();
            const spellId = new Types.ObjectId().toString();
            const character = makeCharacter({
                assets: {
                    ownedEquipments: [],
                    ownedItems: [],
                    wearedEquipment: {},
                    activeSpells: [
                        { spell: new Types.ObjectId(spellId), usages: 3 },
                    ],
                    pet: null,
                },
            });
            const spell = buildSpell({ recoveryTime: 1000 });
            mockCharacterModel.findOne.mockReturnValue(asQuery(character));
            mockSpellModel.findById.mockReturnValue(asQuery(spell));

            const result = await service.useSpell({ characterId, spellId });

            expect(result.successful).toBe(true);
            expect(character.assets.activeSpells[0].usages).toBe(2);
            expect(character.save).toHaveBeenCalledTimes(1);
            expect(mockQueue.add).toHaveBeenCalledTimes(1);
            expect(mockQueue.add).toHaveBeenCalledWith(
                'recover',
                { characterId, spellId },
                expect.objectContaining({ delay: 1000 }),
            );
            expect(mockCharacterModel.findOne).toHaveBeenCalledWith({
                _id: characterId,
                deletedAt: null,
            });
        });

        it('rejects when the active spell has no usages left', async () => {
            const characterId = new Types.ObjectId().toString();
            const spellId = new Types.ObjectId().toString();
            const character = makeCharacter({
                assets: {
                    ownedEquipments: [],
                    ownedItems: [],
                    wearedEquipment: {},
                    activeSpells: [
                        { spell: new Types.ObjectId(spellId), usages: 0 },
                    ],
                    pet: null,
                },
            });
            mockCharacterModel.findOne.mockReturnValue(asQuery(character));

            await expect(
                service.useSpell({ characterId, spellId }),
            ).rejects.toThrow(/no usages left/);
            expect(character.save).not.toHaveBeenCalled();
            expect(mockQueue.add).not.toHaveBeenCalled();
            expect(mockCharacterModel.findOne).toHaveBeenCalledWith({
                _id: characterId,
                deletedAt: null,
            });
        });

        // RED (bug D-06): the spell existence must be validated BEFORE the
        // usage is decremented and persisted. With the current (buggy) order the
        // usage is lost (3 -> 2, saved) even though the spell does not exist.
        it('validation order: does not lose the usage when the spell does not exist', async () => {
            const characterId = new Types.ObjectId().toString();
            const spellId = new Types.ObjectId().toString();
            const character = makeCharacter({
                assets: {
                    ownedEquipments: [],
                    ownedItems: [],
                    wearedEquipment: {},
                    activeSpells: [
                        { spell: new Types.ObjectId(spellId), usages: 3 },
                    ],
                    pet: null,
                },
            });
            mockCharacterModel.findOne.mockReturnValue(asQuery(character));
            // spell active on the character but missing from the Spell collection
            mockSpellModel.findById.mockReturnValue(asQuery(null));

            await expect(
                service.useSpell({ characterId, spellId }),
            ).rejects.toThrow(NotFoundException);
            await expect(
                service.useSpell({ characterId, spellId }),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });

            // usage MUST be untouched and NOT persisted, and no recovery scheduled
            expect(character.assets.activeSpells[0].usages).toBe(3);
            expect(character.save).not.toHaveBeenCalled();
            expect(mockQueue.add).not.toHaveBeenCalled();
            expect(mockCharacterModel.findOne).toHaveBeenCalledWith({
                _id: characterId,
                deletedAt: null,
            });
        });
    });

    describe('archived characters', () => {
        function asPopulatableQuery(doc: any) {
            return {
                populate: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue(doc),
            };
        }

        it('lists only active characters', async () => {
            mockCharacterModel.find.mockReturnValue(asQuery([]));

            await service.findAll();

            expect(mockCharacterModel.find).toHaveBeenCalledWith({
                deletedAt: null,
            });
        });

        it('reports an archived character as not found on findOne', async () => {
            const id = new Types.ObjectId().toString();
            mockCharacterModel.findOne.mockReturnValue(
                asPopulatableQuery(null),
            );

            await expect(service.findOne(id)).rejects.toMatchObject({
                code: 'NOT_FOUND',
            });
            expect(mockCharacterModel.findOne).toHaveBeenCalledWith({
                _id: id,
                deletedAt: null,
            });
        });

        it('reports an archived character as not found on getEquipment', async () => {
            const id = new Types.ObjectId().toString();
            mockCharacterModel.findOne.mockReturnValue(
                asPopulatableQuery(null),
            );

            await expect(service.getEquipment(id)).rejects.toMatchObject({
                code: 'NOT_FOUND',
            });
            expect(mockCharacterModel.findOne).toHaveBeenCalledWith({
                _id: id,
                deletedAt: null,
            });
        });

        it('reports an archived character as not found on doTransaction', async () => {
            const id = new Types.ObjectId().toString();
            mockCharacterModel.findOne.mockReturnValue(asQuery(null));

            await expect(
                service.doTransaction({ id } as TransactionRequest),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(mockCharacterModel.findOne).toHaveBeenCalledWith({
                _id: id,
                deletedAt: null,
            });
        });

        it('reports an archived character as not found on equipItem', async () => {
            const id = new Types.ObjectId().toString();
            mockCharacterModel.findOne.mockReturnValue(asQuery(null));

            await expect(
                service.equipItem({
                    id,
                    slotType: SlotType.head,
                } as EquipItemRequest),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(mockCharacterModel.findOne).toHaveBeenCalledWith({
                _id: id,
                deletedAt: null,
            });
        });
    });
});
