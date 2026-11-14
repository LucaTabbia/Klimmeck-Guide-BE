import {
    ChanceSource,
    MathChanceSource,
} from 'src/quests/outcomes/chance-source';

// D-04: la simulazione non consuma la sorgente delle risoluzioni reali; token distinto, stessa implementazione (RESEARCH Pattern 1)
export abstract class MissionSimulationChance extends ChanceSource {}

export const MISSION_SIMULATION_CHANCE_PROVIDER = {
    provide: MissionSimulationChance,
    useClass: MathChanceSource,
};
