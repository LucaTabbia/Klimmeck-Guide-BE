import {
    loreConfigProvider,
    parseLoreConfig,
    readLoreEnv,
} from 'src/config/lore-config';

describe('lore config', () => {
    it('defaults the study chance to one half when empty (D-08)', () => {
        expect(parseLoreConfig({})).toEqual({ studyChance: 0.5 });
        expect(parseLoreConfig({ LORE_STUDY_CHANCE: '  ' })).toEqual({
            studyChance: 0.5,
        });
    });

    it('accepts a study chance between zero and one included (D-08)', () => {
        expect(parseLoreConfig({ LORE_STUDY_CHANCE: '0' })).toEqual({
            studyChance: 0,
        });
        expect(parseLoreConfig({ LORE_STUDY_CHANCE: '1' })).toEqual({
            studyChance: 1,
        });
        expect(parseLoreConfig({ LORE_STUDY_CHANCE: ' 0.25 ' })).toEqual({
            studyChance: 0.25,
        });
    });

    it('rejects a study chance outside zero and one without echoing the value (D-08)', () => {
        for (const value of ['1.5', '-0.1', 'abc', 'NaN', 'Infinity']) {
            let message = '';
            try {
                parseLoreConfig({ LORE_STUDY_CHANCE: value });
            } catch (error) {
                message = (error as Error).message;
            }

            expect(message).toContain('LORE_STUDY_CHANCE');
            expect(message).not.toContain(value.trim());
        }
    });

    it('reads only the lore keys from the source (D-08)', () => {
        expect(readLoreEnv({ LORE_STUDY_CHANCE: '1', OTHER: 'x' })).toEqual({
            LORE_STUDY_CHANCE: '1',
        });
    });

    it('falls back to the default without a config service (D-08)', () => {
        expect(loreConfigProvider.useFactory(undefined)).toEqual({
            studyChance: 0.5,
        });
    });
});
