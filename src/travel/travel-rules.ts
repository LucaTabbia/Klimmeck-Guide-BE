import { GameRuleException } from 'src/gameRules/game-rule.exception';

export interface FreeTravelFacts {
    destinationIsCityMarker: boolean;
    travelling: boolean;
    onQuest: boolean;
    sameLocation: boolean;
    hasRoute: boolean;
}

export function classifyFreeTravel(
    _facts: FreeTravelFacts,
): GameRuleException | null {
    throw new Error('not implemented');
}
