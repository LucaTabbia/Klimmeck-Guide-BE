import { Types } from 'mongoose';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import {
    type CombatContext,
    type CombatResolution,
    CombatResolver,
} from './combat/combat-resolver';
import {
    type DungeonContext,
    type DungeonResolution,
    DungeonResolver,
} from './dungeon/dungeon-resolver';
import { questBattleOf } from './quest-battle';
import type { ResolutionQuest } from './resolution-loader.service';

const { exploration, fight } = DungeonTurnKind;
const RESCUER_ID = new Types.ObjectId('64b0000000000000000000d1');

// porta finta: risponde la risoluzione data, qualunque sia il contesto
class FixedDungeonResolver extends DungeonResolver {
    readonly contexts: DungeonContext[] = [];

    constructor(private readonly resolution: DungeonResolution) {
        super();
    }

    explore(context: DungeonContext): DungeonResolution {
        this.contexts.push(context);
        return this.resolution;
    }
}

class UnusedCombatResolver extends CombatResolver {
    resolve(): CombatResolution {
        throw new Error('the dungeon never fights through the plain port');
    }
}

const COMBAT_CONTEXT = {
    enemies: [],
    participants: [],
} as unknown as CombatContext;

const dungeonQuest = {
    _id: new Types.ObjectId(),
    infos: { type: QuestType.dungeon },
} as unknown as ResolutionQuest;

const dungeonAid = (turn: unknown) =>
    ({
        _id: new Types.ObjectId(),
        infos: { type: QuestType.aid },
        rescue: { characters: [], turn },
    }) as unknown as ResolutionQuest;

const lostOn = (
    overrides: Partial<DungeonResolution> = {},
): DungeonResolution => ({
    verdict: 'failure',
    participants: [],
    stagesCleared: 1,
    stagesTotal: 4,
    turnsTotal: 8,
    turnsCompleted: 3,
    failedTurn: { index: 3, kind: fight },
    ...overrides,
});

const battleWith = (quest: ResolutionQuest, resolution: DungeonResolution) =>
    questBattleOf({
        quest,
        combatContext: COMBAT_CONTEXT,
        participants: [],
        combat: new UnusedCombatResolver(),
        dungeon: new FixedDungeonResolver(resolution),
        chance: new SequenceChance(),
    });

describe('questBattleOf dungeon port contract (C-WR-02, D-13)', () => {
    it.each([
        ['a defeat without the failed turn', lostOn({ failedTurn: null })],
        [
            'a failed turn past the last turn',
            lostOn({ failedTurn: { index: 8, kind: exploration } }),
        ],
        [
            'a negative failed turn',
            lostOn({ failedTurn: { index: -1, kind: fight } }),
        ],
        [
            'a failed turn that is not an integer',
            lostOn({ failedTurn: { index: 2.5, kind: exploration } }),
        ],
        [
            'a failed turn of the wrong kind',
            lostOn({ failedTurn: { index: 3, kind: exploration } }),
        ],
        [
            'completed turns that differ from the failed one',
            lostOn({ turnsCompleted: 2 }),
        ],
    ])('rejects %s', (_, resolution) => {
        expect(() => battleWith(dungeonQuest, resolution)).toThrow(
            'port contract',
        );
    });

    it('rejects a rescuer who falls past the saved turn', () => {
        const aid = dungeonAid({ index: 2, kind: exploration, total: 8 });

        expect(() => battleWith(aid, lostOn())).toThrow('port contract');
    });

    it('saves the turn of the fall on the total of the dungeon (D-12)', () => {
        const battle = battleWith(dungeonQuest, lostOn());

        expect(battle.fallenTurn).toEqual({ index: 3, kind: fight, total: 8 });
        expect(battle.battleOf(RESCUER_ID)?.verdict).toBe('failure');
    });

    it('saves the turn of the fall on the total of the saved turn (D-26)', () => {
        const aid = dungeonAid({ index: 4, kind: exploration, total: 10 });

        expect(battleWith(aid, lostOn()).fallenTurn).toEqual({
            index: 3,
            kind: fight,
            total: 10,
        });
    });

    it('saves no turn on a victory (D-12)', () => {
        const won = lostOn({
            verdict: 'success',
            turnsCompleted: 8,
            failedTurn: null,
        });

        expect(battleWith(dungeonQuest, won).fallenTurn).toBeNull();
    });
});
