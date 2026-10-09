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

function buildNamed(name: string) {
    return buildCharacter({ infos: { ...buildCharacter().infos, name } });
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
    });

    afterEach(async () => {
        errorSpy.mockRestore();
        await CharacterModel.deleteMany({});
        await CharacterModel.createIndexes();
    });

    describe('character name index', () => {
        it('is unique on infos.name with a case-insensitive collation', async () => {
            const indexes = await CharacterModel.collection.indexes();
            const nameIndex = indexes.find(
                (index) => index.name === 'character_name_ci_unique',
            );

            expect(nameIndex).toBeDefined();
            expect(nameIndex?.unique).toBe(true);
            expect(nameIndex?.key).toEqual({ 'infos.name': 1 });
            expect(nameIndex?.collation).toMatchObject({
                locale: 'en',
                strength: 2,
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
            expect(message).toContain('character_name_ci_unique');
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
    });
});
