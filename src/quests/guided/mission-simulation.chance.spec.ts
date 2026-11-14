import {
    ChanceSource,
    MathChanceSource,
} from 'src/quests/outcomes/chance-source';
import {
    MISSION_SIMULATION_CHANCE_PROVIDER,
    MissionSimulationChance,
} from 'src/quests/guided/mission-simulation.chance';

describe('MissionSimulationChance', () => {
    it('binds the simulation chance to its own token (D-04)', () => {
        expect(MISSION_SIMULATION_CHANCE_PROVIDER.provide).toBe(
            MissionSimulationChance,
        );
        expect(MISSION_SIMULATION_CHANCE_PROVIDER.provide).not.toBe(
            ChanceSource,
        );
        expect(MISSION_SIMULATION_CHANCE_PROVIDER.useClass).toBe(
            MathChanceSource,
        );
    });
});
