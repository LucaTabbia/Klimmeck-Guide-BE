import { TitleType } from 'src/models/enums/title-type.enum';
import { RANK_XP_BANDS } from 'src/quests/generation/generation-rules';
import {
    MissionEnemyCandidate,
    MissionPoolRule,
    byMissionOrder,
    missionBandOf,
    missionEnemyPoolOf,
} from './mission-enemy-pool';

function enemy(
    id: string,
    overrides: Partial<MissionEnemyCandidate> = {},
): MissionEnemyCandidate {
    return {
        id,
        name: `Nemico ${id}`,
        xp: 300,
        locations: ['ruins'],
        legendary: false,
        ...overrides,
    };
}

const MAGE_RUINS: MissionPoolRule = {
    poiTypes: ['ruins'],
    band: RANK_XP_BANDS.mage,
    legendaries: false,
};

const idsOf = (enemies: readonly MissionEnemyCandidate[]): string[] =>
    enemies.map((candidate) => candidate.id);

describe('missionEnemyPoolOf', () => {
    it('keeps the enemies of the place or the city within the mission band (D-03)', () => {
        const enemies = [
            enemy('a1', { xp: 300 }),
            enemy('a2', { xp: 548, locations: ['city'] }),
            enemy('a3', { xp: 300, locations: ['forest'] }),
            enemy('a4', { xp: 100 }),
            enemy('a5', { xp: 300, locations: ['all'] }),
            enemy('a6', { xp: 225, locations: ['forest', 'ruins'] }),
            enemy('a7', { xp: 549 }),
        ];

        expect(idsOf(missionEnemyPoolOf(enemies, MAGE_RUINS))).toEqual([
            'a6',
            'a1',
            'a2',
        ]);
    });

    it('includes the animals (D-19)', () => {
        const wolf = enemy('b1', { name: 'Lupo delle rovine', xp: 260 });

        expect(missionEnemyPoolOf([wolf], MAGE_RUINS)).toEqual([wolf]);
    });

    it('adds the legendaries of the zone for a world mission without band (D-03, D-19)', () => {
        const enemies = [
            enemy('c1', { xp: 300 }),
            enemy('c2', { xp: 2000, legendary: true }),
            enemy('c3', { xp: 2000, legendary: true, locations: ['forest'] }),
        ];

        expect(
            idsOf(
                missionEnemyPoolOf(enemies, {
                    ...MAGE_RUINS,
                    legendaries: true,
                }),
            ),
        ).toEqual(['c1', 'c2']);
        expect(idsOf(missionEnemyPoolOf(enemies, MAGE_RUINS))).toEqual(['c1']);
    });

    it('falls back to anywhere enemies when the zone is empty (D-19)', () => {
        const enemies = [
            enemy('d1', { xp: 300, locations: ['all'] }),
            enemy('d2', { xp: 100, locations: ['all'] }),
            enemy('d3', { xp: 300, locations: ['forest'] }),
        ];

        expect(
            idsOf(
                missionEnemyPoolOf(enemies, {
                    ...MAGE_RUINS,
                    poiTypes: ['swamp'],
                }),
            ),
        ).toEqual(['d1']);
    });

    it('orders by xp, then name, then id (D-19)', () => {
        const enemies = [
            enemy('e4', { xp: 400, name: 'Alfa' }),
            enemy('e3', { xp: 300, name: 'Beta' }),
            enemy('e2', { xp: 300, name: 'Alfa' }),
            enemy('e1', { xp: 300, name: 'Alfa' }),
        ];

        expect(idsOf(missionEnemyPoolOf(enemies, MAGE_RUINS))).toEqual([
            'e1',
            'e2',
            'e3',
            'e4',
        ]);
        expect(idsOf([...enemies].sort(byMissionOrder))).toEqual([
            'e1',
            'e2',
            'e3',
            'e4',
        ]);
    });

    it('never offers an enemy with an unknown legendary flag (D-03)', () => {
        const enemies = [
            enemy('f1', { legendary: undefined }),
            enemy('f2', { legendary: 'yes' }),
        ];

        expect(
            missionEnemyPoolOf(enemies, { ...MAGE_RUINS, legendaries: true }),
        ).toEqual([]);
    });
});

describe('missionBandOf', () => {
    it('takes the band of the minimum title for a story (D-19)', () => {
        expect(missionBandOf(TitleType.paladin, [])).toEqual({
            min: 70,
            max: 224,
        });
    });

    it('joins the bands from the minimum title to the highest seat (D-19)', () => {
        expect(
            missionBandOf(TitleType.paladin, [
                TitleType.mage,
                TitleType.paladin,
            ]),
        ).toEqual({ min: 70, max: 548 });
    });

    it('plays legend as hero (D-19)', () => {
        expect(missionBandOf(TitleType.legend, [TitleType.legend])).toEqual(
            RANK_XP_BANDS.hero,
        );
    });

    it('plays a missing title as rookie (D-19)', () => {
        expect(missionBandOf(null, [undefined])).toEqual(RANK_XP_BANDS.rookie);
    });
});
