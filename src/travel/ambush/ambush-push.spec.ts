import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { PushEventType } from 'src/push/push-event-type.enum';
import {
    type AmbushPushFacts,
    ambushPushFactsOf,
    ambushPushOf,
} from './ambush-push';

const RESULT_ID = '64b0000000000000000000f1';

const factsWith = (overrides: Partial<AmbushPushFacts>): AmbushPushFacts => ({
    resultId: RESULT_ID,
    won: true,
    nearCity: 'Crocevia',
    reachedCity: null,
    fallenCompanion: null,
    onFoot: false,
    hungerRedirect: false,
    ...overrides,
});

describe('ambushPushOf', () => {
    it.each([
        [
            'tells a won ambush (D-14)',
            {},
            'Imboscata presso Crocevia: hai respinto gli assalitori',
        ],
        [
            'tells the fallen companion by its shown name (D-14, D-20)',
            { fallenCompanion: 'Fenrir' },
            'Imboscata presso Crocevia: Fenrir è stato sconfitto',
        ],
        [
            'tells the rest of the road on foot (D-14)',
            { fallenCompanion: 'Fenrir', onFoot: true },
            'Imboscata presso Crocevia: Fenrir è stato sconfitto, prosegui a piedi',
        ],
        [
            'tells the hunger redirection (D-14)',
            { reachedCity: 'Borgo', hungerRedirect: true },
            'Imboscata presso Crocevia: hai respinto gli assalitori; la fame ti porta verso Borgo',
        ],
        [
            'tells a lost ambush with the city reached and the fallen companion (D-14)',
            { won: false, reachedCity: 'Borgo', fallenCompanion: 'Fenrir' },
            'Sei stato sconfitto: la via torna verso Borgo. Fenrir è stato sconfitto',
        ],
        [
            'tells a lost ambush with the city reached (D-14)',
            { won: false, reachedCity: 'Borgo' },
            'Sei stato sconfitto: la via torna verso Borgo',
        ],
    ])('%s', (_name, overrides: Partial<AmbushPushFacts>, body) => {
        expect(ambushPushOf(factsWith(overrides))).toEqual({
            type: PushEventType.ambush,
            id: RESULT_ID,
            title: 'Imboscata!',
            body,
            ttlSeconds: 3600,
        });
    });

    it('uses the ambush result as push id (D-30)', () => {
        const resultId = '64b0000000000000000000f2';

        expect(ambushPushOf(factsWith({ resultId })).id).toBe(resultId);
    });
});

describe('ambushPushFactsOf', () => {
    const resultId = new Types.ObjectId();
    const crocevia = { name: 'Crocevia' };

    it('reads the facts from an ambush report (D-14)', () => {
        expect(
            ambushPushFactsOf({
                resultId,
                outcome: QuestOutcome.success,
                nearCity: crocevia,
                reachedCity: null,
                companion: { name: 'Fenrir', defeated: true },
            }),
        ).toEqual({
            resultId: resultId.toHexString(),
            won: true,
            nearCity: 'Crocevia',
            reachedCity: null,
            fallenCompanion: 'Fenrir',
            onFoot: false,
            hungerRedirect: false,
        });
    });

    it('reads a lost ambush with a standing companion (D-14)', () => {
        expect(
            ambushPushFactsOf({
                resultId,
                outcome: QuestOutcome.failure,
                nearCity: crocevia,
                reachedCity: { name: 'Borgo' },
                companion: { name: 'Fenrir', defeated: false },
            }),
        ).toEqual({
            resultId: resultId.toHexString(),
            won: false,
            nearCity: 'Crocevia',
            reachedCity: 'Borgo',
            fallenCompanion: null,
            onFoot: false,
            hungerRedirect: false,
        });
    });

    it('reads the road on foot and the hunger redirection of a won ambush (D-14)', () => {
        expect(
            ambushPushFactsOf({
                resultId,
                outcome: QuestOutcome.success,
                nearCity: crocevia,
                reachedCity: { name: 'Borgo' },
                companion: { name: 'Fenrir', defeated: true },
                onFoot: true,
            }),
        ).toMatchObject({ onFoot: true, hungerRedirect: true });
    });
});
