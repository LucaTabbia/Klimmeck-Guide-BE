// titoli in italiano col nome della città (D-22); il testo dell'annuncio è in quest-descriptions.ts (D-32)
export const QUEST_TITLES = {
    heal: (city: string) => `Cure al tempio di ${city}`,
    job: (city: string) => `Lavori di bottega a ${city}`,
    innJob: (city: string) => `Un aiuto alla locanda di ${city}`,
    guard: (city: string) => `Turno di guardia a ${city}`,
    crime: (city: string) => `Affari loschi a ${city}`,
    study: (city: string) => `Ricerche in biblioteca a ${city}`,
    spellStudy: (city: string) => `Studi arcani a ${city}`,
    hunt: (city: string, enemy: string) =>
        `Caccia: ${enemy} nei dintorni di ${city}`,
    dungeon: (city: string, enemy: string) =>
        `Dungeon: ${enemy} presso ${city}`,
} as const;
