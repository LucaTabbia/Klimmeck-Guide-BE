import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { CharacterNameIndexVerifier } from 'src/characters/creation/character-name-index.verifier';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    DUPLICATE_KEY_ERROR_CODE,
    isDuplicateKeyOn,
} from 'src/mongo/mongo-errors';
import { buildCharacter, persistCharacter } from '../../../test/fixtures';

const CharacterModel: Model<CharacterDocument> =
    mongoose.models.Character ||
    mongoose.model(Character.name, CharacterSchema);
const PoiModel: Model<PointOfInterest> =
    mongoose.models.PointOfInterest ||
    mongoose.model(PointOfInterest.name, PointOfInterestSchema);

function persistNamed(name: string) {
    return persistCharacter(
        CharacterModel,
        { infos: { ...buildCharacter().infos, name } },
        PoiModel,
    );
}

function persistArchived(name: string) {
    return persistCharacter(
        CharacterModel,
        {
            infos: { ...buildCharacter().infos, name },
            deletedAt: new Date(),
            deletionReason: DeletionReason.user_request,
        },
        PoiModel,
    );
}

function buildNamed(name: string) {
    return buildCharacter({ infos: { ...buildCharacter().infos, name } });
}

async function indexNames(): Promise<(string | undefined)[]> {
    return (await CharacterModel.collection.indexes()).map(
        (index) => index.name,
    );
}

function createLegacyIndex() {
    return CharacterModel.collection.createIndex(
        { 'infos.name': 1 },
        {
            unique: true,
            collation: { locale: 'en', strength: 2 },
            name: 'character_name_ci_unique',
        },
    );
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
        () => undefined,
        (error: unknown) => error,
    );
}

describe('CharacterNameIndexVerifier (replSet)', () => {
    let verifier: CharacterNameIndexVerifier;
    let errorSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;

    beforeAll(async () => {
        await CharacterModel.init();
        const moduleRef = await Test.createTestingModule({
            providers: [
                CharacterNameIndexVerifier,
                {
                    provide: getModelToken(Character.name),
                    useValue: CharacterModel,
                },
            ],
        }).compile();
        verifier = moduleRef.get(CharacterNameIndexVerifier);
    });

    beforeEach(() => {
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await CharacterModel.deleteMany({});
        await CharacterModel.collection
            .dropIndex('character_name_ci_unique')
            .catch(() => undefined);
        await CharacterModel.createIndexes();
    });

    describe('character name index', () => {
        it('is unique on infos.name with a case-insensitive collation, among active characters', async () => {
            const indexes = await CharacterModel.collection.indexes();
            const nameIndex = indexes.find(
                (index) => index.name === 'character_name_active_ci_unique',
            );

            expect(nameIndex).toBeDefined();
            expect(nameIndex?.unique).toBe(true);
            expect(nameIndex?.key).toEqual({ 'infos.name': 1 });
            expect(nameIndex?.collation).toMatchObject({
                locale: 'en',
                strength: 2,
            });
            expect(nameIndex?.partialFilterExpression).toEqual({
                deletedAt: null,
            });
        });

        it('rejects a name that differs only by case, on infos.name', async () => {
            await persistNamed('Élan');

            const error = await rejectionOf(persistNamed('ÉLAN'));

            expect(error).toBeDefined();
            expect(isDuplicateKeyOn(error, 'infos.name')).toBe(true);
        });

        it('rejects a lowercased accented name', async () => {
            await persistNamed('Élan');

            await expect(persistNamed('élan')).rejects.toMatchObject({
                code: DUPLICATE_KEY_ERROR_CODE,
            });
        });

        it('accepts a name that differs by an accent', async () => {
            await persistNamed('Élan');

            await expect(persistNamed('Elan')).resolves.toBeDefined();
        });

        it('rejects a name with an apostrophe that differs only by case', async () => {
            await persistNamed("D'Arcy");

            await expect(persistNamed("d'arcy")).rejects.toMatchObject({
                code: DUPLICATE_KEY_ERROR_CODE,
            });
        });

        it('accepts the name of an archived character, in any case', async () => {
            await persistArchived('Aria');

            await expect(persistNamed('aria')).resolves.toBeDefined();
        });

        it('accepts two archived characters with the same name', async () => {
            await persistArchived('Bruno');

            await expect(persistArchived('Bruno')).resolves.toBeDefined();
        });

        it('keeps protecting legacy characters without the deletedAt field', async () => {
            await CharacterModel.collection.insertOne(buildNamed('Ciro'));
            const legacy = await CharacterModel.collection.findOne({
                'infos.name': 'Ciro',
            });
            expect(legacy).not.toBeNull();
            expect(legacy).not.toHaveProperty('deletedAt');

            const error = await rejectionOf(persistNamed('CIRO'));

            expect(isDuplicateKeyOn(error, 'infos.name')).toBe(true);
        });
    });

    describe('onApplicationBootstrap', () => {
        it('logs nothing when the index can be built', async () => {
            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(errorSpy).not.toHaveBeenCalled();
        });

        it('explains colliding names without listing them and without throwing', async () => {
            await CharacterModel.collection.dropIndexes();
            await CharacterModel.collection.insertMany([
                { ...buildNamed('Aria') },
                { ...buildNamed('ARIA') },
            ]);

            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(errorSpy).toHaveBeenCalledTimes(1);
            const [message] = errorSpy.mock.calls[0] as [string];
            expect(message).toContain('characters.infos.name');
            expect(message).toContain('character_name_active_ci_unique');
            expect(message).not.toContain('Aria');
            expect(message).not.toContain('ARIA');
        });

        it('logs the real cause without blaming collisions when the index fails for another reason', async () => {
            jest.spyOn(CharacterModel, 'createIndexes').mockRejectedValueOnce(
                Object.assign(new Error('not authorized'), {
                    name: 'MongoServerError',
                    code: 13,
                }),
            );

            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(errorSpy).toHaveBeenCalledTimes(1);
            const [message] = errorSpy.mock.calls[0] as [string];
            expect(message).toContain('MongoServerError, code 13');
            expect(message).not.toContain('collide');
        });

        it('drops the legacy index once and frees archived names', async () => {
            await createLegacyIndex();
            await persistArchived('Dora');

            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            const names = await indexNames();
            expect(names).not.toContain('character_name_ci_unique');
            expect(names).toContain('character_name_active_ci_unique');
            expect(errorSpy).not.toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledTimes(1);
            const [message] = logSpy.mock.calls[0] as [string];
            expect(message).toContain('character_name_ci_unique');
            await expect(persistNamed('dora')).resolves.toBeDefined();
        });

        it('stays silent when the legacy index is already gone', async () => {
            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(errorSpy).not.toHaveBeenCalled();
            expect(logSpy).not.toHaveBeenCalled();
        });

        it('keeps the legacy index when the new index cannot be built', async () => {
            await createLegacyIndex();
            jest.spyOn(CharacterModel, 'createIndexes').mockRejectedValueOnce(
                Object.assign(new Error('not authorized'), {
                    name: 'MongoServerError',
                    code: 13,
                }),
            );
            const dropSpy = jest.spyOn(CharacterModel.collection, 'dropIndex');

            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(dropSpy).not.toHaveBeenCalled();
            expect(await indexNames()).toContain('character_name_ci_unique');
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('logs without throwing when the legacy index cannot be dropped', async () => {
            jest.spyOn(
                CharacterModel.collection,
                'dropIndex',
            ).mockRejectedValueOnce(
                Object.assign(new Error('not authorized'), {
                    name: 'MongoServerError',
                    code: 13,
                }),
            );

            await expect(verifier.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            expect(errorSpy).toHaveBeenCalledTimes(1);
            const [message] = errorSpy.mock.calls[0] as [string];
            expect(message).toContain('character_name_ci_unique');
            expect(message).toContain('MongoServerError, code 13');
        });
    });
});
