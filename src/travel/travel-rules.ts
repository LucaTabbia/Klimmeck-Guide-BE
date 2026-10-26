import { GameRuleException } from 'src/gameRules/game-rule.exception';

export interface FreeTravelFacts {
    destinationIsCityMarker: boolean;
    awaitingAid: boolean;
    travelling: boolean;
    onQuest: boolean;
    sameLocation: boolean;
    hasRoute: boolean;
}

// ordine fisso (RESEARCH Q9): meta ammessa → in attesa di soccorso (D-07) → viaggio in corso → quest della corsia standard → stessa posizione → percorso; story/worldMission non bloccano (D-04)
export function classifyFreeTravel(
    facts: FreeTravelFacts,
): GameRuleException | null {
    if (!facts.destinationIsCityMarker)
        return GameRuleException.travelDestinationNotAllowed();
    if (facts.awaitingAid) return GameRuleException.awaitingAid();
    if (facts.travelling) return GameRuleException.travelInProgress();
    if (facts.onQuest) return GameRuleException.questInProgress();
    if (facts.sameLocation) return GameRuleException.travelSameLocation();
    if (!facts.hasRoute) return GameRuleException.travelNoPath();
    return null;
}
