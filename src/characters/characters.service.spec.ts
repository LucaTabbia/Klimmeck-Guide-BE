import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { Character } from 'src/models/character/character.model';
import { SlotType } from 'src/models/enums/slot_type.enum';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';
import { Spell } from 'src/models/spell.model';
import { QUEUE_CALL_TIMEOUT } from 'src/queues/queue-call-timeout';
import { FixedClock } from '../../test/auth/fixed-clock';
import { CHARACTER_QUESTS_POPULATE } from './character-quests.populate';
import { CharactersService } from './characters.service';
import {
    ACTIVE_SPELL_SNAPSHOT_PROJECTION,
    equipSpellFilter,
    equipSpellUpdate,
    unequipSpellFilter,
    unequipSpellUpdate,
} from './spells/active-spell.updates';
import { spellRecoveryJobId } from './spells/spell-recovery-job';
import {
    spellStateArrayFilters,
    spendUsagesUpdate,
    useSpellFilter,
} from './spells/spell-state.updates';

/**
 * UNIT: CharactersService spell mutations with the Bull queue mocked at the DI
 * boundary (getQueueToken) — no Redis, no replSet. The Mongoose models are
 * replaced with plain jest mocks (getModelToken). The character change stream
 * lives in CharacterUpdatesPublisher, not in the service.
 */

const mockQueue = { add: jest.fn() };
const mockCharacterModel = {
    findOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
    exists: jest.fn(),
};
const mockSpellModel = { findById: jest.fn() };
const NOW = new Date('2026-10-27T10:00:00.000Z');

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
                { provide: Clock, useValue: new FixedClock(NOW) },
                { provide: QUEUE_CALL_TIMEOUT, useValue: 50 },
            ],
        }).compile();

        service = moduleRef.get<CharactersService>(CharactersService);
    });

    describe('equipSpell', () => {
        const c = new Types.ObjectId();
        const s = new Types.ObjectId();

        it('equipSpell copies the state usages with a single conditional pipeline update', async () => {
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
            expect(Array.isArray(update)).toBe(true);
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

        it.each([
            ['missing', {}],
            ['not a number', { maxUsages: 'three' }],
            ['negative', { maxUsages: -1 }],
            ['fractional', { maxUsages: 1.5 }],
        ])(
            'equipSpell answers NOT_FOUND without writing for a catalog spell whose maxUsages is %s',
            async (_, catalogEntry) => {
                mockSpellModel.findById.mockReturnValue(
                    asLeanQuery(catalogEntry),
                );

                await expect(
                    service.equipSpell({
                        id: c.toHexString(),
                        spellId: s.toHexString(),
                    }),
                ).rejects.toMatchObject({ code: 'NOT_FOUND' });
                expect(mockCharacterModel.updateOne).not.toHaveBeenCalled();
            },
        );

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

        it('equipSpell classifies again on a fresh reread when the first shows no violated guard', async () => {
            mockSpellModel.findById.mockReturnValue(
                asLeanQuery({ maxUsages: 3 }),
            );
            mockCharacterModel.updateOne.mockReturnValue(asUpdate(0));
            mockCharacterModel.findOne
                .mockReturnValueOnce(
                    asLeanQuery({
                        status: { spells: [s], xp: 20000, title: 'mage' },
                        assets: { activeSpells: [] },
                    }),
                )
                .mockReturnValueOnce(
                    asLeanQuery({
                        status: { spells: [s], xp: 20000, title: 'mage' },
                        assets: { activeSpells: [{ spell: s, usages: 3 }] },
                    }),
                );

            await expect(
                service.equipSpell({
                    id: c.toHexString(),
                    spellId: s.toHexString(),
                }),
            ).rejects.toMatchObject({ code: 'SPELL_ALREADY_ACTIVE' });
            expect(mockCharacterModel.findOne).toHaveBeenCalledTimes(2);
        });

        it('equipSpell falls back to MAX_ACTIVE_SPELLS_REACHED when two rereads show no violated guard', async () => {
            mockSpellModel.findById.mockReturnValue(
                asLeanQuery({ maxUsages: 3 }),
            );
            mockCharacterModel.updateOne.mockReturnValue(asUpdate(0));
            const freeSlot = {
                status: { spells: [s], xp: 20000, title: 'mage' },
                assets: { activeSpells: [] },
            };
            mockCharacterModel.findOne
                .mockReturnValueOnce(asLeanQuery(freeSlot))
                .mockReturnValueOnce(asLeanQuery(freeSlot));

            await expect(
                service.equipSpell({
                    id: c.toHexString(),
                    spellId: s.toHexString(),
                }),
            ).rejects.toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
            expect(mockCharacterModel.findOne).toHaveBeenCalledTimes(2);
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
        const c = new Types.ObjectId();
        const s = new Types.ObjectId();
        const request = {
            characterId: c.toHexString(),
            spellId: s.toHexString(),
        };

        beforeEach(() => {
            mockSpellModel.findById.mockReset();
        });

        function givenCatalogSpell() {
            mockSpellModel.findById.mockReturnValueOnce(
                asLeanQuery({ maxUsages: 3, recoveryTime: 1000 }),
            );
        }

        it('validates the spell before the conditional decrement', async () => {
            mockSpellModel.findById.mockReturnValueOnce(asLeanQuery(null));

            await expect(service.useSpell(request)).rejects.toMatchObject({
                code: 'NOT_FOUND',
            });
            expect(mockCharacterModel.updateOne).not.toHaveBeenCalled();
            expect(mockQueue.add).not.toHaveBeenCalled();
        });

        it('answers NOT_FOUND for a catalog spell with a malformed recoveryTime', async () => {
            mockSpellModel.findById
                .mockReturnValueOnce(asLeanQuery({ maxUsages: 3 }))
                .mockReturnValueOnce(
                    asLeanQuery({ maxUsages: 3, recoveryTime: 'abc' }),
                );

            await expect(service.useSpell(request)).rejects.toMatchObject({
                code: 'NOT_FOUND',
            });
            await expect(service.useSpell(request)).rejects.toMatchObject({
                code: 'NOT_FOUND',
            });
            expect(mockCharacterModel.updateOne).not.toHaveBeenCalled();
            expect(mockQueue.add).not.toHaveBeenCalled();
        });

        it('decrements with a single conditional update, then queues the recovery', async () => {
            givenCatalogSpell();
            mockCharacterModel.updateOne.mockReturnValueOnce(asUpdate(1));
            mockQueue.add.mockResolvedValueOnce({});
            const dueAt = new Date(NOW.getTime() + 1000);

            const result = await service.useSpell(request);

            expect(result.successful).toBe(true);
            expect(mockCharacterModel.updateOne).toHaveBeenCalledTimes(1);
            expect(mockCharacterModel.updateOne).toHaveBeenCalledWith(
                useSpellFilter(c, s),
                spendUsagesUpdate([dueAt]),
                spellStateArrayFilters(s),
            );
            expect(
                mockCharacterModel.updateOne.mock.invocationCallOrder[0],
            ).toBeLessThan(mockQueue.add.mock.invocationCallOrder[0]);
            expect(mockQueue.add).toHaveBeenCalledWith(
                'recover',
                {
                    characterId: c.toHexString(),
                    spellId: s.toHexString(),
                    dueAt: dueAt.getTime(),
                },
                expect.objectContaining({
                    jobId: spellRecoveryJobId(c, s, dueAt),
                    delay: 1000,
                }),
            );
        });

        it('classifies a rejected decrement from a lean reread', async () => {
            givenCatalogSpell();
            mockCharacterModel.updateOne.mockReturnValueOnce(asUpdate(0));
            mockCharacterModel.findOne.mockReturnValueOnce(
                asLeanQuery({
                    status: {
                        spells: [s],
                        spellStates: [{ spell: s, usages: 0, recoveries: [] }],
                    },
                    assets: { activeSpells: [{ spell: s, usages: 0 }] },
                }),
            );

            await expect(service.useSpell(request)).rejects.toMatchObject({
                code: 'SPELL_NO_USAGES_LEFT',
            });
            expect(mockQueue.add).not.toHaveBeenCalled();
        });

        it('classifies again on a fresh reread when the first shows usages left', async () => {
            givenCatalogSpell();
            mockCharacterModel.updateOne.mockReturnValueOnce(asUpdate(0));
            mockCharacterModel.findOne
                .mockReturnValueOnce(
                    asLeanQuery({
                        status: {
                            spells: [s],
                            spellStates: [
                                { spell: s, usages: 1, recoveries: [] },
                            ],
                        },
                        assets: { activeSpells: [{ spell: s, usages: 1 }] },
                    }),
                )
                .mockReturnValueOnce(
                    asLeanQuery({
                        status: { spells: [s] },
                        assets: { activeSpells: [] },
                    }),
                );

            await expect(service.useSpell(request)).rejects.toMatchObject({
                code: 'SPELL_NOT_ACTIVE',
            });
            expect(mockCharacterModel.findOne).toHaveBeenCalledTimes(2);
            expect(mockQueue.add).not.toHaveBeenCalled();
        });

        it('falls back to SPELL_NO_USAGES_LEFT when two rereads show usages left', async () => {
            givenCatalogSpell();
            mockCharacterModel.updateOne.mockReturnValueOnce(asUpdate(0));
            const usageLeft = {
                status: {
                    spells: [s],
                    spellStates: [{ spell: s, usages: 1, recoveries: [] }],
                },
                assets: { activeSpells: [{ spell: s, usages: 1 }] },
            };
            mockCharacterModel.findOne
                .mockReturnValueOnce(asLeanQuery(usageLeft))
                .mockReturnValueOnce(asLeanQuery(usageLeft));

            await expect(service.useSpell(request)).rejects.toMatchObject({
                code: 'SPELL_NO_USAGES_LEFT',
            });
            expect(mockCharacterModel.findOne).toHaveBeenCalledTimes(2);
            expect(mockQueue.add).not.toHaveBeenCalled();
        });

        it('keeps the spent usage when the queue rejects, without a second update', async () => {
            const warnSpy = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation(() => undefined);
            givenCatalogSpell();
            mockCharacterModel.updateOne.mockReturnValueOnce(asUpdate(1));
            mockQueue.add.mockRejectedValueOnce(new Error('redis down'));

            try {
                const result = await service.useSpell(request);

                expect(result.successful).toBe(true);
                expect(mockCharacterModel.updateOne).toHaveBeenCalledTimes(1);
                expect(warnSpy).toHaveBeenCalledWith(
                    expect.stringContaining('lo restituirà lo sweep'),
                );
            } finally {
                warnSpy.mockRestore();
            }
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
            const query = asPopulatableQuery([]);
            mockCharacterModel.find.mockReturnValue(query);

            await service.findAll();

            expect(mockCharacterModel.find).toHaveBeenCalledWith({
                deletedAt: null,
            });
            expect(query.populate).toHaveBeenCalledWith(
                CHARACTER_QUESTS_POPULATE,
            );
        });

        it('populates the quest lanes and the completed quests with the quest id only', async () => {
            const query = asPopulatableQuery({
                assets: {
                    ownedEquipments: [],
                    wearedEquipment: {},
                    activeSpells: [],
                },
                status: { spells: [] },
            });
            mockCharacterModel.findOne.mockReturnValue(query);

            await service.findOne(new Types.ObjectId().toString());

            expect(query.populate).toHaveBeenCalledWith(
                CHARACTER_QUESTS_POPULATE,
            );
            const questIdOnly = {
                path: 'quest',
                model: 'Quest',
                select: '_id',
            };
            expect(CHARACTER_QUESTS_POPULATE).toEqual([
                {
                    path: 'quests.pendingQuest',
                    model: 'PendingQuest',
                    populate: questIdOnly,
                },
                {
                    path: 'quests.activeStoryQuest',
                    model: 'PendingQuest',
                    populate: questIdOnly,
                },
                {
                    path: 'quests.activeWorldMissionQuest',
                    model: 'PendingQuest',
                    populate: questIdOnly,
                },
                {
                    path: 'quests.completedQuests',
                    model: 'Quest',
                    select: '_id',
                },
            ]);
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

        // lo scambio vive in src/economy (04 D-05): la copertura dell'archiviato è sul wire
        it('no longer exposes doTransaction on CharactersService', () => {
            expect(
                (service as unknown as Record<string, unknown>).doTransaction,
            ).toBeUndefined();
        });

        it('reports an archived character as not found on equipItem', async () => {
            const id = new Types.ObjectId().toString();
            mockCharacterModel.updateOne.mockReturnValue(asUpdate(0));
            mockCharacterModel.exists.mockReturnValue(asQuery(null));

            await expect(
                service.equipItem({
                    id,
                    slotType: SlotType.head,
                } as EquipItemRequest),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(mockCharacterModel.updateOne.mock.calls[0][0]).toMatchObject(
                { deletedAt: null },
            );
            expect(mockCharacterModel.exists).toHaveBeenCalledWith({
                _id: new Types.ObjectId(id),
                deletedAt: null,
            });
        });

        it('equipItem rejects an unowned item with ITEM_NOT_OWNED', async () => {
            const id = new Types.ObjectId();
            mockCharacterModel.updateOne.mockReturnValue(asUpdate(0));
            mockCharacterModel.exists.mockReturnValue(asQuery({ _id: id }));

            await expect(
                service.equipItem({
                    id: id.toHexString(),
                    itemId: new Types.ObjectId().toHexString(),
                    slotType: SlotType.head,
                }),
            ).rejects.toMatchObject({ code: 'ITEM_NOT_OWNED' });
        });
    });
});
