import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Character } from 'src/models/character/character.model';
import { Spell } from 'src/models/spell.model';
import { buildCharacter, buildSpell } from '../../test/fixtures';
import { CharactersService } from './characters.service';

/**
 * UNIT: CharactersService spell mutations with the Bull queue mocked at the DI
 * boundary (getQueueToken) — no Redis, no replSet. The Mongoose models are
 * replaced with plain jest mocks (getModelToken). onModuleInit is NOT triggered
 * (compile() does not call lifecycle hooks), so the change-stream `.watch` on the
 * mocked model is never exercised here.
 */

const mockQueue = { add: jest.fn() };
const mockCharacterModel = { findById: jest.fn() };
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

/** Mongoose findById(...).exec() shape. */
function asQuery(doc: any) {
    return { exec: jest.fn().mockResolvedValue(doc) };
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
        it('equips a known spell into a free slot', async () => {
            const spellId = new Types.ObjectId().toString();
            const characterId = new Types.ObjectId().toString();
            const character = makeCharacter({
                status: {
                    xp: 20000,
                    maxActiveSpells: 1,
                    spells: [new Types.ObjectId(spellId)],
                    location: new Types.ObjectId(),
                },
                assets: {
                    ownedEquipments: [],
                    ownedItems: [],
                    wearedEquipment: {},
                    activeSpells: [],
                    pet: null,
                },
            });
            mockCharacterModel.findById.mockReturnValue(asQuery(character));

            const result = await service.equipSpell({
                id: characterId,
                spellId,
                usages: 3,
            });

            expect(result.successful).toBe(true);
            expect(character.assets.activeSpells).toHaveLength(1);
            expect(character.assets.activeSpells[0].spell.toString()).toBe(
                spellId,
            );
            expect(character.assets.activeSpells[0].usages).toBe(3);
            expect(character.save).toHaveBeenCalledTimes(1);
        });

        it('rejects a spell the character does not know', async () => {
            const spellId = new Types.ObjectId().toString();
            const character = makeCharacter({
                status: {
                    xp: 20000,
                    maxActiveSpells: 1,
                    spells: [], // does not know spellId
                    location: new Types.ObjectId(),
                },
            });
            mockCharacterModel.findById.mockReturnValue(asQuery(character));

            await expect(
                service.equipSpell({ id: 'c1', spellId }),
            ).rejects.toThrow(BadRequestException);
            await expect(
                service.equipSpell({ id: 'c1', spellId }),
            ).rejects.toThrow(/is not known/);
            expect(character.save).not.toHaveBeenCalled();
        });

        it('rejects when the active-spell slots are full', async () => {
            const spellId = new Types.ObjectId().toString();
            const character = makeCharacter({
                status: {
                    xp: 20000,
                    maxActiveSpells: 1,
                    spells: [new Types.ObjectId(spellId)],
                    location: new Types.ObjectId(),
                },
                assets: {
                    ownedEquipments: [],
                    ownedItems: [],
                    wearedEquipment: {},
                    // slot already occupied by another spell
                    activeSpells: [{ spell: new Types.ObjectId(), usages: 1 }],
                    pet: null,
                },
            });
            mockCharacterModel.findById.mockReturnValue(asQuery(character));

            await expect(
                service.equipSpell({ id: 'c1', spellId }),
            ).rejects.toThrow(/maximum number of active spells/);
            expect(character.save).not.toHaveBeenCalled();
        });
    });

    describe('unequipSpell', () => {
        it('removes an active spell', async () => {
            const spellId = new Types.ObjectId().toString();
            const character = makeCharacter({
                assets: {
                    ownedEquipments: [],
                    ownedItems: [],
                    wearedEquipment: {},
                    activeSpells: [
                        { spell: new Types.ObjectId(spellId), usages: 2 },
                    ],
                    pet: null,
                },
            });
            mockCharacterModel.findById.mockReturnValue(asQuery(character));

            const result = await service.unequipSpell({ id: 'c1', spellId });

            expect(result.successful).toBe(true);
            expect(character.assets.activeSpells).toHaveLength(0);
            expect(character.save).toHaveBeenCalledTimes(1);
        });

        it('rejects unequipping a spell that is not active', async () => {
            const spellId = new Types.ObjectId().toString();
            const character = makeCharacter({
                assets: {
                    ownedEquipments: [],
                    ownedItems: [],
                    wearedEquipment: {},
                    activeSpells: [],
                    pet: null,
                },
            });
            mockCharacterModel.findById.mockReturnValue(asQuery(character));

            await expect(
                service.unequipSpell({ id: 'c1', spellId }),
            ).rejects.toThrow(NotFoundException);
            await expect(
                service.unequipSpell({ id: 'c1', spellId }),
            ).rejects.toThrow(/is not active/);
            expect(character.save).not.toHaveBeenCalled();
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
            mockCharacterModel.findById.mockReturnValue(asQuery(character));
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
            mockCharacterModel.findById.mockReturnValue(asQuery(character));

            await expect(
                service.useSpell({ characterId, spellId }),
            ).rejects.toThrow(/no usages left/);
            expect(character.save).not.toHaveBeenCalled();
            expect(mockQueue.add).not.toHaveBeenCalled();
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
            mockCharacterModel.findById.mockReturnValue(asQuery(character));
            // spell active on the character but missing from the Spell collection
            mockSpellModel.findById.mockReturnValue(asQuery(null));

            await expect(
                service.useSpell({ characterId, spellId }),
            ).rejects.toThrow(NotFoundException);

            // usage MUST be untouched and NOT persisted, and no recovery scheduled
            expect(character.assets.activeSpells[0].usages).toBe(3);
            expect(character.save).not.toHaveBeenCalled();
            expect(mockQueue.add).not.toHaveBeenCalled();
        });
    });
});
