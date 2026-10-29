import mongoose, { Model } from 'mongoose';
import {
    Character,
    CHARACTER_NAME_INDEX,
    CharacterSchema,
    LEGACY_CHARACTER_NAME_INDEX,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { buildCharacter } from '../../../test/fixtures';

describe('Character schema archive fields', () => {
    // nessuna connessione: new Model + validateSync lavorano in memoria
    const CharacterModel: Model<any> =
        mongoose.models[Character.name] ||
        mongoose.model(Character.name, CharacterSchema);

    it('stores deletedAt as a Date, never as Mixed', () => {
        expect(CharacterSchema.path('deletedAt').instance).toBe('Date');
        expect(CharacterSchema.path('deletedAt').instance).not.toBe('Mixed');
    });

    it('restricts deletionReason to the DeletionReason values', () => {
        const path = CharacterSchema.path('deletionReason');

        expect(path.instance).toBe('String');
        expect(path.options.enum).toEqual(['user_request', 'death']);
    });

    it('creates active characters with null archive fields', () => {
        const character = new CharacterModel(buildCharacter());

        expect(character.deletedAt).toBeNull();
        expect(character.deletionReason).toBeNull();
        expect(character.validateSync()).toBeUndefined();
    });

    it('accepts an archived character', () => {
        const character = new CharacterModel({
            ...buildCharacter(),
            deletedAt: new Date(),
            deletionReason: DeletionReason.user_request,
        });

        expect(character.validateSync()).toBeUndefined();
    });

    it('rejects an unknown deletion reason', () => {
        const character = new CharacterModel({
            ...buildCharacter(),
            deletionReason: 'bogus',
        });

        expect(character.validateSync()?.errors.deletionReason).toBeDefined();
    });

    it('defines exactly the user_request and death reasons', () => {
        expect(Object.values(DeletionReason)).toEqual([
            'user_request',
            'death',
        ]);
    });
});

describe('character name index', () => {
    const nameIndexes = () =>
        CharacterSchema.indexes().filter(
            ([fields]) =>
                Object.keys(fields).length === 1 && fields['infos.name'] === 1,
        );

    it('declares exactly one index on infos.name', () => {
        expect(nameIndexes()).toHaveLength(1);
    });

    it('is unique and case-insensitive among active characters only', () => {
        const [[, options]] = nameIndexes();

        expect(options).toMatchObject({
            name: 'character_name_active_ci_unique',
            unique: true,
            collation: { locale: 'en', strength: 2 },
            partialFilterExpression: { deletedAt: null },
        });
    });

    it('names the partial index and the legacy global index', () => {
        expect(CHARACTER_NAME_INDEX).toBe('character_name_active_ci_unique');
        expect(LEGACY_CHARACTER_NAME_INDEX).toBe('character_name_ci_unique');
    });
});
