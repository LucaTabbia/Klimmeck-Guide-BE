import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CoinsInput } from 'src/models/common/coins.model';
import { MAX_OVERRIDE_ENTRIES } from 'src/models/request/complete-pending-request.model';
import { BACKGROUND_ADDITION_MAX_FORM_LENGTH } from './background-additions';
import {
    MissionBackgroundAdditionInput,
    MissionPrizeInput,
    SaveMissionDraftInput,
} from './mission-draft.inputs';
import { MissionDraftStep } from './mission-draft.model';

const CEILING = 9_999_999;
const CHARACTER_ID = '64f3a0000000000000000001';
const PENDING_QUEST_ID = '64f3a0000000000000000002';

const prizeOf = (overrides: Record<string, unknown> = {}) =>
    plainToInstance(MissionPrizeInput, {
        characterId: CHARACTER_ID,
        coins: { gold: 0, silver: 0, copper: 0 },
        cure: false,
        items: [],
        pet: null,
        spell: null,
        xp: 0,
        ...overrides,
    });

const invalidFieldsOf = async (input: object) =>
    (await validate(input)).map(({ property }) => property);

const additionOf = (overrides: Record<string, unknown> = {}) =>
    plainToInstance(MissionBackgroundAdditionInput, {
        characterId: CHARACTER_ID,
        text: 'Ha salvato il mugnaio.',
        ...overrides,
    });

const saveOf = (sections: Record<string, unknown> = {}) =>
    plainToInstance(SaveMissionDraftInput, {
        pendingQuestId: PENDING_QUEST_ID,
        ...sections,
    });

describe('MissionPrizeInput', () => {
    it('accepts every coin and the xp at the technical ceiling (D-15, D-31)', async () => {
        const prize = prizeOf({
            coins: { gold: CEILING, silver: CEILING, copper: CEILING },
            xp: CEILING,
        });

        expect(await invalidFieldsOf(prize)).toEqual([]);
    });

    it.each([
        [
            'gold',
            { coins: { gold: CEILING + 1, silver: 0, copper: 0 } },
            'coins',
        ],
        [
            'silver',
            { coins: { gold: 0, silver: CEILING + 1, copper: 0 } },
            'coins',
        ],
        [
            'copper',
            { coins: { gold: 0, silver: 0, copper: CEILING + 1 } },
            'coins',
        ],
        ['xp', { xp: CEILING + 1 }, 'xp'],
    ])(
        'refuses %s over the technical ceiling (D-15, D-31)',
        async (_name, overrides, field) => {
            expect(await invalidFieldsOf(prizeOf(overrides))).toEqual([field]);
        },
    );

    it('keeps the shared coins input of the shop free of the prize ceiling (D-15)', async () => {
        const coins = plainToInstance(CoinsInput, {
            gold: CEILING + 1,
            silver: 0,
            copper: 0,
        });

        expect(await validate(coins)).toEqual([]);
    });
});

describe('MissionBackgroundAdditionInput', () => {
    it('accepts a background addition of the form cap (D-07)', async () => {
        const addition = additionOf({
            text: 'a'.repeat(BACKGROUND_ADDITION_MAX_FORM_LENGTH),
        });

        expect(await invalidFieldsOf(addition)).toEqual([]);
    });

    it('rejects a background addition text over the form cap (D-07)', async () => {
        const addition = additionOf({
            text: 'a'.repeat(BACKGROUND_ADDITION_MAX_FORM_LENGTH + 1),
        });

        expect(await invalidFieldsOf(addition)).toEqual(['text']);
    });

    it.each([
        ['empty', ''],
        ['blank', '  \n\t '],
    ])(
        'accepts a background addition with an empty text: %s (D-06)',
        async (_name, text) => {
            expect(await invalidFieldsOf(additionOf({ text }))).toEqual([]);
        },
    );

    it('rejects a background addition without a character id (D-06)', async () => {
        const addition = additionOf({ characterId: undefined });

        expect(await invalidFieldsOf(addition)).toEqual(['characterId']);
    });
});

describe('SaveMissionDraftInput', () => {
    it('accepts the stories step (D-05)', async () => {
        const save = saveOf({ step: 'stories' });

        expect(MissionDraftStep).toHaveProperty('stories', 'stories');
        expect(await invalidFieldsOf(save)).toEqual([]);
    });

    it('validates each background addition of the section (D-06)', async () => {
        const save = saveOf({ backgroundAdditions: [{ text: 'Senza eroe' }] });

        expect(save.backgroundAdditions?.[0]).toBeInstanceOf(
            MissionBackgroundAdditionInput,
        );
        expect(await invalidFieldsOf(save)).toEqual(['backgroundAdditions']);
    });

    it('rejects more additions than the list cap (D-06)', async () => {
        const save = saveOf({
            backgroundAdditions: Array.from(
                { length: MAX_OVERRIDE_ENTRIES + 1 },
                () => ({ characterId: CHARACTER_ID, text: '' }),
            ),
        });

        expect(await invalidFieldsOf(save)).toEqual(['backgroundAdditions']);
    });

    it.each([
        ['omitted', {}],
        ['null', { backgroundAdditions: null }],
    ])(
        'accepts a save without the additions section: %s (D-05)',
        async (_name, sections) => {
            expect(await invalidFieldsOf(saveOf(sections))).toEqual([]);
        },
    );
});
