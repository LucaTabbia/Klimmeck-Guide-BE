import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { classifyFreeTravel, FreeTravelFacts } from './travel-rules';

const OK: FreeTravelFacts = {
    destinationIsCityMarker: true,
    awaitingAid: false,
    travelling: false,
    onQuest: false,
    sameLocation: false,
    hasRoute: true,
};

function codeOf(facts: Partial<FreeTravelFacts>) {
    return classifyFreeTravel({ ...OK, ...facts })?.code;
}

describe('classifyFreeTravel', () => {
    it('allows a free travel when every fact is fine', () => {
        expect(classifyFreeTravel(OK)).toBeNull();
    });

    it.each<[string, Partial<FreeTravelFacts>, GameRuleErrorCode]>([
        [
            'not a city',
            { destinationIsCityMarker: false },
            GameRuleErrorCode.TRAVEL_DESTINATION_NOT_ALLOWED,
        ],
        ['awaiting aid', { awaitingAid: true }, GameRuleErrorCode.AWAITING_AID],
        [
            'travelling',
            { travelling: true },
            GameRuleErrorCode.TRAVEL_IN_PROGRESS,
        ],
        ['on quest', { onQuest: true }, GameRuleErrorCode.QUEST_IN_PROGRESS],
        [
            'same location',
            { sameLocation: true },
            GameRuleErrorCode.TRAVEL_SAME_LOCATION,
        ],
        ['no route', { hasRoute: false }, GameRuleErrorCode.TRAVEL_NO_PATH],
    ])('rejects %s', (_label, facts, code) => {
        expect(codeOf(facts)).toBe(code);
    });

    it.each<[string, Partial<FreeTravelFacts>, GameRuleErrorCode]>([
        [
            'every defect',
            {
                destinationIsCityMarker: false,
                awaitingAid: true,
                travelling: true,
                onQuest: true,
                sameLocation: true,
                hasRoute: false,
            },
            GameRuleErrorCode.TRAVEL_DESTINATION_NOT_ALLOWED,
        ],
        [
            'awaiting aid while travelling, on quest and without a route',
            {
                awaitingAid: true,
                travelling: true,
                onQuest: true,
                sameLocation: true,
                hasRoute: false,
            },
            GameRuleErrorCode.AWAITING_AID,
        ],
        [
            'travelling, on quest and same location',
            { travelling: true, onQuest: true, sameLocation: true },
            GameRuleErrorCode.TRAVEL_IN_PROGRESS,
        ],
        [
            'on quest, same location and no route',
            { onQuest: true, sameLocation: true, hasRoute: false },
            GameRuleErrorCode.QUEST_IN_PROGRESS,
        ],
        [
            'same location and no route',
            { sameLocation: true, hasRoute: false },
            GameRuleErrorCode.TRAVEL_SAME_LOCATION,
        ],
    ])('orders the rejections: %s', (_label, facts, code) => {
        expect(codeOf(facts)).toBe(code);
    });
});
