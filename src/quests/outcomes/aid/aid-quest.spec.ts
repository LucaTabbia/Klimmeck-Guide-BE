import { Types } from 'mongoose';
import {
    AID_TITLE_PREFIX,
    AidSourceQuest,
    aidSlotsOf,
    buildAidQuest,
} from 'src/quests/outcomes/aid/aid-quest';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';

const ORIGINAL_ID = new Types.ObjectId('64b0000000000000000000c1');
const MARKER_ID = new Types.ObjectId('64b0000000000000000000c2');
const ENEMY_ID = new Types.ObjectId('64b0000000000000000000c3');
const LORE_ID = new Types.ObjectId('64b0000000000000000000c4');
const INJURED_ID = new Types.ObjectId('64b0000000000000000000c5');
const AID_ID = new Types.ObjectId('64b0000000000000000000c6');
const RESCUER_ID = new Types.ObjectId('64b0000000000000000000c7');
const NEXT_AID_ID = new Types.ObjectId('64b0000000000000000000c8');
const LOOT_ID = new Types.ObjectId('64b0000000000000000000c9');
const OTHER_INJURED_ID = new Types.ObjectId('64b0000000000000000000ca');
const OTHER_ENEMY_ID = new Types.ObjectId('64b0000000000000000000cb');
const PET_ID = new Types.ObjectId('64b0000000000000000000cc');

const lootEntry = { itemType: 'LootItem', item: LOOT_ID, quantity: 1 };

const original: AidSourceQuest = {
    _id: ORIGINAL_ID,
    infos: {
        title: 'Il drago di Valantar',
        description: 'Un drago minaccia le mura di Valantar.',
        type: QuestType.boss,
        markerLocation: MARKER_ID,
        enemies: [
            { enemy: ENEMY_ID, quantity: 3 },
            { enemy: OTHER_ENEMY_ID, quantity: 1 },
        ],
        timeToComplete: 3600000,
        relatedLore: [LORE_ID],
    } as AidSourceQuest['infos'],
    requirements: {
        minTitle: TitleType.hero,
        requiredPoints: 10,
        requiredAdventurers: [{ title: TitleType.hero, count: 5 }],
        recommendedLoot: [],
    } as AidSourceQuest['requirements'],
    prizes: {
        prizeCoins: { gold: 5, silver: 0, copper: 0 },
        xpPrize: 800,
        prizeItem: null,
        randomLoot: [lootEntry],
        spell: null,
        pet: PET_ID,
    },
};

describe('buildAidQuest', () => {
    const aid = buildAidQuest(original, [INJURED_ID, OTHER_INJURED_ID], AID_ID);

    it('clones the failed quest as an aid titled after it', () => {
        expect(aid._id).toBe(AID_ID);
        expect(aid.infos.title).toBe('Soccorso: Il drago di Valantar');
        expect(aid.infos.type).toBe('aid');
        expect(aid.infos.markerLocation).toEqual(MARKER_ID);
        expect(aid.infos.timeToComplete).toBe(3600000);
        expect(aid.infos.relatedLore).toEqual([LORE_ID]);
    });

    it('clones the enemies list in order with the quantities (D-01, D-12)', () => {
        expect(aid.infos.enemies).toEqual([
            { enemy: ENEMY_ID, quantity: 3 },
            { enemy: OTHER_ENEMY_ID, quantity: 1 },
        ]);
        expect(aid.infos.enemies).not.toBe(original.infos.enemies);
    });

    it('clones a legacy single enemy as a one-entry list (D-28)', () => {
        const legacyInfos = { ...original.infos, enemy: ENEMY_ID };
        delete legacyInfos.enemies;

        const legacy = buildAidQuest(
            { ...original, infos: legacyInfos },
            [INJURED_ID],
            AID_ID,
        );

        expect(legacy.infos.enemies).toEqual([
            { enemy: ENEMY_ID, quantity: 1 },
        ]);
    });

    it('clones no enemies for a quest without enemies (D-01)', () => {
        const peaceful = buildAidQuest(
            { ...original, infos: { ...original.infos, enemies: [] } },
            [INJURED_ID],
            AID_ID,
        );

        expect(peaceful.infos.enemies).toEqual([]);
    });

    it('clones the pet prize (D-21)', () => {
        const petless = buildAidQuest(
            { ...original, prizes: { ...original.prizes, pet: undefined } },
            [INJURED_ID],
            AID_ID,
        );

        expect(aid.prizes.pet).toEqual(PET_ID);
        expect(petless.prizes.pet).toBeNull();
    });

    it('never marks the aid as generated (D-17)', () => {
        expect(Object.keys(aid).sort()).toEqual([
            '_id',
            'concludedAt',
            'infos',
            'prizes',
            'registeredAdventurers',
            'requirements',
            'rescue',
        ]);
    });

    it('keeps the announcement of the failed quest (D-32)', () => {
        expect(aid.infos.description).toBe(
            'Un drago minaccia le mura di Valantar.',
        );
    });

    it('opens the same seats as the failed quest, at no cost, keeping the minimum title', () => {
        expect(aid.requirements).toEqual({
            minTitle: 'hero',
            requiredPoints: null,
            requiredAdventurers: [{ title: 'hero', count: 5 }],
            recommendedLoot: [],
        });
    });

    it('copies the seats without sharing references', () => {
        const source = original.requirements?.requiredAdventurers as unknown[];

        expect(aid.requirements.requiredAdventurers).not.toBe(source);
        expect(aid.requirements.requiredAdventurers[0]).not.toBe(source[0]);
    });

    it('copies the prizes without sharing references', () => {
        expect(aid.prizes).toEqual(original.prizes);
        expect(aid.prizes).not.toBe(original.prizes);
        expect(aid.prizes.randomLoot).not.toBe(original.prizes?.randomLoot);
    });

    it('starts open, empty and linked to every wounded of the lost fight', () => {
        expect(aid.registeredAdventurers).toEqual([]);
        expect(aid.concludedAt).toBeNull();
        expect(aid.rescue).toEqual({
            characters: [INJURED_ID, OTHER_INJURED_ID],
            failedQuest: ORIGINAL_ID,
        });
    });

    it('saves the turn of the defeat on a dungeon aid (D-12)', () => {
        const dungeon: AidSourceQuest = {
            ...original,
            infos: { ...original.infos, type: QuestType.dungeon },
        };
        const turn = { index: 4, kind: DungeonTurnKind.exploration, total: 8 };

        const saved = buildAidQuest(dungeon, [INJURED_ID], AID_ID, turn);
        const unsaved = buildAidQuest(dungeon, [INJURED_ID], AID_ID);

        expect(saved.rescue.turn).toEqual(turn);
        expect(saved.rescue.turn).not.toBe(turn);
        expect(Object.keys(unsaved.rescue).sort()).toEqual([
            'characters',
            'failedQuest',
        ]);
    });

    it('does not share the wounded list with the caller', () => {
        const injured = [INJURED_ID];

        const single = buildAidQuest(original, injured, AID_ID);

        expect(single.rescue.characters).toEqual(injured);
        expect(single.rescue.characters).not.toBe(injured);
    });

    it('always points a chained aid back to the original failed quest, keeping the seats', () => {
        const chained = buildAidQuest(
            {
                ...original,
                _id: AID_ID,
                infos: { ...original.infos, title: aid.infos.title },
                requirements: aid.requirements,
                rescue: { failedQuest: ORIGINAL_ID },
            },
            [RESCUER_ID],
            NEXT_AID_ID,
        );

        expect(chained.rescue.failedQuest).toEqual(ORIGINAL_ID);
        expect(chained.rescue.characters).toEqual([RESCUER_ID]);
        expect(chained.requirements.requiredAdventurers).toEqual([
            { title: 'hero', count: 5 },
        ]);
        expect(chained.infos.title).toBe(
            `${AID_TITLE_PREFIX}Il drago di Valantar`,
        );
    });

    it('fills the missing fields with empty defaults', () => {
        const bare = buildAidQuest(
            {
                _id: ORIGINAL_ID,
                infos: {
                    title: 'Sentiero',
                    markerLocation: MARKER_ID,
                    enemy: null,
                },
            },
            [INJURED_ID],
            AID_ID,
        );

        expect(bare.infos.enemies).toEqual([]);
        expect(bare.requirements.requiredAdventurers).toEqual([
            { title: null, count: 1 },
        ]);
        expect(bare.infos.timeToComplete).toBeNull();
        expect(bare.infos.description).toBeNull();
        expect(bare.prizes).toEqual({
            prizeCoins: null,
            xpPrize: null,
            prizeItem: null,
            randomLoot: [],
            spell: null,
            pet: null,
        });
    });

    // quick 261111-enm: la aid di una enemy non eredita il posto a titolo scritto prima della regola
    it.each([
        ['the rank-exact seat written before the rule', TitleType.rookie],
        ['a seat without a title', null],
    ])(
        'gives the aid of an enemy quest with %s one rank-free seat (quick 261111-enm)',
        (_label, title) => {
            const enemyQuest: AidSourceQuest = {
                ...original,
                infos: { ...original.infos, type: QuestType.enemy },
                requirements: {
                    minTitle: TitleType.rookie,
                    requiredAdventurers: [{ title, count: 1 }],
                },
            };

            const rescue = buildAidQuest(enemyQuest, [INJURED_ID], AID_ID);

            expect(rescue.requirements.requiredAdventurers).toEqual([
                { title: null, count: 1 },
            ]);
            expect(rescue.requirements.minTitle).toBe(TitleType.rookie);
        },
    );

    it('does not clone the cure of the failed quest (D-23)', () => {
        const healing = {
            ...original,
            prizes: {
                ...original.prizes,
                cure: { lifePointsShare: 1, canHeal: ['deepCut'] },
            },
        };

        expect(
            Object.keys(
                buildAidQuest(healing, [INJURED_ID], AID_ID).prizes,
            ).sort(),
        ).toEqual([
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'xpPrize',
        ]);
    });
});

describe('buildAidQuest rank blocks', () => {
    const mageBlock = {
        title: TitleType.mage,
        prizeCoins: { gold: 3, silver: 0, copper: 0 },
        xpPrize: 500,
        prizeItem: lootEntry,
        randomLoot: [lootEntry],
        spell: null,
        pet: PET_ID,
        cure: { lifePointsShare: 1, canHeal: ['deepCut'] },
    };
    const paladinBlock = {
        title: TitleType.paladin,
        prizeCoins: { gold: 2, silver: 0, copper: 0 },
        xpPrize: 300,
        prizeItem: null,
        randomLoot: [],
        spell: null,
        pet: null,
        cure: null,
    };

    it('clones the rank blocks of a group quest without their cure (D-11)', () => {
        const boss: AidSourceQuest = {
            ...original,
            prizes: {
                ...original.prizes,
                rankPrizes: [mageBlock, paladinBlock],
            },
        };

        const { prizes } = buildAidQuest(boss, [INJURED_ID], AID_ID);

        expect(prizes.rankPrizes).toEqual([
            { ...mageBlock, cure: null },
            { ...paladinBlock, cure: null },
        ]);
        const [clonedMage] = prizes.rankPrizes as (typeof mageBlock)[];
        expect(clonedMage.randomLoot).not.toBe(mageBlock.randomLoot);
    });

    const bossWith = (rankPrizes: unknown[]): AidSourceQuest => ({
        ...original,
        prizes: { ...original.prizes, rankPrizes },
    });

    // lo schema vuole un titolo dell'enum: un blocco illeggibile farebbe fallire la nascita dell'aid
    it('clones only the blocks the boss reads, with a valid title (B-WR-02, D-01)', () => {
        const { prizes } = buildAidQuest(
            bossWith([
                null,
                { ...paladinBlock, title: 'Mage' },
                mageBlock,
                { ...paladinBlock, title: undefined },
            ]),
            [INJURED_ID],
            AID_ID,
        );

        expect(prizes.rankPrizes).toEqual([{ ...mageBlock, cure: null }]);
    });

    it('clones the first block of a repeated title, the one the boss reads (B-WR-02, D-18)', () => {
        const { prizes } = buildAidQuest(
            bossWith([mageBlock, paladinBlock, { ...mageBlock, xpPrize: 1 }]),
            [INJURED_ID],
            AID_ID,
        );

        expect(prizes.rankPrizes).toEqual([
            { ...mageBlock, cure: null },
            { ...paladinBlock, cure: null },
        ]);
    });

    it('writes no blocks when none has a valid title (B-WR-02, D-01)', () => {
        const { prizes } = buildAidQuest(
            bossWith([{ ...mageBlock, title: 'mago' }]),
            [INJURED_ID],
            AID_ID,
        );

        expect(Object.keys(prizes)).not.toContain('rankPrizes');
    });

    it('does not inherit the blocks left on a solo quest (A-WR-02, D-01, D-11)', () => {
        const hunt: AidSourceQuest = {
            ...bossWith([mageBlock]),
            infos: { ...original.infos, type: QuestType.hunt },
        };

        const { prizes } = buildAidQuest(hunt, [INJURED_ID], AID_ID);

        expect(Object.keys(prizes)).not.toContain('rankPrizes');
        expect(prizes.xpPrize).toBe(800);
    });

    it('keeps the single prize on the aid of a solo quest (D-11)', () => {
        const hunt: AidSourceQuest = {
            ...original,
            infos: { ...original.infos, type: QuestType.hunt },
        };

        expect(
            Object.keys(
                buildAidQuest(hunt, [INJURED_ID], AID_ID).prizes,
            ).sort(),
        ).toEqual([
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'xpPrize',
        ]);
    });
});

describe('buildAidQuest proportional prize', () => {
    const dungeon: AidSourceQuest = {
        ...original,
        infos: { ...original.infos, type: QuestType.dungeon },
        requirements: { minTitle: TitleType.rookie },
        prizes: {
            prizeCoins: { gold: 1, silver: 0, copper: 1 },
            xpPrize: 101,
            prizeItem: lootEntry,
            randomLoot: [lootEntry],
            spell: null,
            pet: PET_ID,
        },
    };
    const turnOf = (index: number) => ({
        index,
        kind:
            index % 2 === 0
                ? DungeonTurnKind.exploration
                : DungeonTurnKind.fight,
        total: 8,
    });

    it('writes the shared prize on a dungeon aid at birth (D-20)', () => {
        const { prizes } = buildAidQuest(
            dungeon,
            [INJURED_ID],
            AID_ID,
            turnOf(3),
        );

        expect(prizes.xpPrize).toBe(50);
        expect(prizes.prizeCoins).toEqual({ gold: 0, silver: 50, copper: 0 });
        expect(prizes.prizeItem).toBeNull();
        expect(prizes.randomLoot).toEqual([lootEntry]);
        expect(prizes.pet).toEqual(PET_ID);
    });

    it('shares again from the original in a chain (D-20)', () => {
        const first = buildAidQuest(dungeon, [INJURED_ID], AID_ID, turnOf(3));
        const second = buildAidQuest(
            dungeon,
            [RESCUER_ID],
            NEXT_AID_ID,
            turnOf(1),
        );

        expect(first.prizes.xpPrize).toBe(50);
        expect(second.prizes.xpPrize).toBe(25);
        expect(second.prizes.prizeCoins).toEqual({
            gold: 0,
            silver: 25,
            copper: 0,
        });
    });

    it('rescales an already shared aid by the ratio of the shares (D-20)', () => {
        const sharedAid: AidSourceQuest = {
            ...dungeon,
            _id: AID_ID,
            prizes: { ...dungeon.prizes, xpPrize: 50 },
            rescue: { failedQuest: ORIGINAL_ID, turn: turnOf(3) },
        };

        const { prizes } = buildAidQuest(
            sharedAid,
            [RESCUER_ID],
            NEXT_AID_ID,
            turnOf(1),
        );

        expect(prizes.xpPrize).toBe(25);
    });

    it('keeps the full prize on an aid without a turn (D-14)', () => {
        const hunt: AidSourceQuest = {
            ...dungeon,
            infos: { ...dungeon.infos, type: QuestType.hunt },
        };

        const { prizes } = buildAidQuest(hunt, [INJURED_ID], AID_ID);

        expect(prizes).toEqual({
            prizeCoins: { gold: 1, silver: 0, copper: 1 },
            xpPrize: 101,
            prizeItem: lootEntry,
            randomLoot: [lootEntry],
            spell: null,
            pet: PET_ID,
        });
    });
});

describe('aidSlotsOf', () => {
    it.each([
        ['a single rank slot', [{ title: TitleType.hero, count: 5 }]],
        [
            'rank and wildcard slots',
            [
                { title: TitleType.paladin, count: 1 },
                { title: null, count: 2 },
            ],
        ],
        ['a single-adventurer quest', [{ title: null, count: 1 }]],
    ])('copies the seats of %s', (_label, slots) => {
        const copied = aidSlotsOf(slots);

        expect(copied).toEqual(slots);
        expect(copied).not.toBe(slots);
        copied.forEach((slot, index) => expect(slot).not.toBe(slots[index]));
    });

    it('reads the seats of an enemy quest as one rank-free seat (quick 261111-enm)', () => {
        expect(
            aidSlotsOf([{ title: TitleType.mage, count: 1 }], QuestType.enemy),
        ).toEqual([{ title: null, count: 1 }]);
        expect(
            aidSlotsOf([{ title: TitleType.mage, count: 2 }], QuestType.boss),
        ).toEqual([{ title: TitleType.mage, count: 2 }]);
    });

    it('reads a missing title as a wildcard seat', () => {
        expect(aidSlotsOf([{ count: 2 }])).toEqual([{ title: null, count: 2 }]);
    });

    it.each([
        ['missing', undefined],
        ['null', null],
        ['empty', []],
        ['a legacy number', 3],
        ['an invalid slot', [{ title: null, count: 0 }]],
        ['an unknown title', [{ title: 'emperor', count: 2 }]],
    ])(
        'falls back to one wildcard seat when the slots are %s (T-09-86)',
        (_label, value) => {
            expect(aidSlotsOf(value)).toEqual([{ title: null, count: 1 }]);
        },
    );
});
