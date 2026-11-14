import { Types } from 'mongoose';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    NO_REWARDS,
    PrizesSnapshot,
    QUEST_PET_WIN_CHANCE,
    SPELL_DRAW_CHANCE,
    RewardCatalog,
    SpellCandidate,
    canLearnSpell,
    drawLearnableSpell,
    drawRewards,
    drawStudyLore,
    rewardRefsOf,
    validRewardItems,
} from 'src/quests/outcomes/rewards/quest-rewards';
import { SequenceChance } from '../../../../test/quests/sequence-chance';

const POTION_ID = new Types.ObjectId('64b0000000000000000000b1');
const ORPHAN_ID = new Types.ObjectId('64b0000000000000000000b2');
const BONE_ID = new Types.ObjectId('64b0000000000000000000b3');
const SPELL_ID = new Types.ObjectId('64b0000000000000000000b4');
const ORPHAN_SPELL_ID = new Types.ObjectId('64b0000000000000000000b5');
const PET_ID = new Types.ObjectId('64b0000000000000000000b6');
const ORPHAN_PET_ID = new Types.ObjectId('64b0000000000000000000b7');
const LORE_1 = new Types.ObjectId('64b0000000000000000000d1');
const LORE_2 = new Types.ObjectId('64b0000000000000000000d2');
const LORE_3 = new Types.ObjectId('64b0000000000000000000d3');

const emptyCatalog: RewardCatalog = {
    rarities: new Map(),
    spells: new Map(),
    spellPool: [],
    pets: new Map(),
};

const catalog: RewardCatalog = {
    rarities: new Map<string, RarityType | null>([
        [`LootItem:${POTION_ID.toHexString()}`, RarityType.uncommon],
        [`LootItem:${BONE_ID.toHexString()}`, RarityType.common],
    ]),
    spells: new Map([
        [SPELL_ID.toHexString(), { minXpToLearn: 4000, maxUsages: 4 }],
    ]),
    spellPool: [],
    pets: new Map(),
};

const spellOf = (
    hex: string,
    minXpToLearn: number,
    maxUsages = 3,
): SpellCandidate => ({
    spellId: new Types.ObjectId(hex),
    minXpToLearn,
    maxUsages,
});

const SPELL_A = spellOf('64b0000000000000000000c1', 100);
const SPELL_B = spellOf('64b0000000000000000000c2', 300);
const SPELL_C = spellOf('64b0000000000000000000c3', 5000);
const SPELL_D = spellOf('64b0000000000000000000c4', 200);

const prizesWith = (overrides: PrizesSnapshot): PrizesSnapshot => ({
    prizeCoins: null,
    xpPrize: null,
    prizeItem: null,
    randomLoot: [],
    spell: null,
    ...overrides,
});

describe('drawRewards', () => {
    it('grants nothing when the quest has no prizes', () => {
        expect(drawRewards(null, emptyCatalog, new SequenceChance())).toEqual(
            NO_REWARDS,
        );
        expect(NO_REWARDS).toEqual({
            coinsCopper: 0,
            xpPrize: 0,
            items: [],
            spellCandidate: null,
            spellDraw: null,
            pet: null,
            petLifePoints: null,
            petLore: [],
            loreDraw: null,
            cure: null,
        });
    });

    it('converts coins to copper and keeps a valid prize item', () => {
        const prizes = prizesWith({
            prizeCoins: { gold: 1, silver: 2, copper: 3 },
            xpPrize: 90,
            prizeItem: { itemType: 'LootItem', item: POTION_ID, quantity: 2 },
        });

        expect(drawRewards(prizes, catalog, new SequenceChance())).toEqual({
            coinsCopper: 10203,
            xpPrize: 90,
            items: [{ itemType: 'LootItem', item: POTION_ID, quantity: 2 }],
            spellCandidate: null,
            spellDraw: null,
            pet: null,
            petLifePoints: null,
            petLore: [],
            loreDraw: null,
            cure: null,
        });
    });

    it.each([
        [
            'an orphan item',
            { itemType: 'LootItem', item: ORPHAN_ID, quantity: 1 },
        ],
        [
            'a zero quantity',
            { itemType: 'LootItem', item: POTION_ID, quantity: 0 },
        ],
        [
            'a fractional quantity',
            { itemType: 'LootItem', item: POTION_ID, quantity: 1.5 },
        ],
        [
            'an unknown item type',
            { itemType: 'Pet', item: POTION_ID, quantity: 1 },
        ],
    ])('discards a prize item with %s', (_label, prizeItem) => {
        const rewards = drawRewards(
            prizesWith({ prizeItem }),
            catalog,
            new SequenceChance(),
        );

        expect(rewards.items).toEqual([]);
    });

    it('rolls the loot only among catalogued entries, after the prize item', () => {
        const prizes = prizesWith({
            prizeItem: { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
            randomLoot: [
                { itemType: 'LootItem', item: ORPHAN_ID, quantity: 1 },
                { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
            ],
        });

        const rewards = drawRewards(prizes, catalog, new SequenceChance([0.1]));

        expect(rewards.items).toEqual([
            { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
            { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
        ]);
    });

    it('keeps only the rolled common entry when the loot holds an orphan', () => {
        const prizes = prizesWith({
            randomLoot: [
                { itemType: 'LootItem', item: ORPHAN_ID, quantity: 1 },
                { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
            ],
        });

        const rewards = drawRewards(prizes, catalog, new SequenceChance([0.1]));

        expect(rewards.items).toEqual([
            { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
        ]);
    });

    it.each([[-5], ['90'], [null]])(
        'grants no experience for a malformed xpPrize %p',
        (xpPrize) => {
            const rewards = drawRewards(
                prizesWith({ xpPrize }),
                catalog,
                new SequenceChance(),
            );

            expect(rewards.xpPrize).toBe(0);
        },
    );

    it('offers the catalogued spell as a candidate', () => {
        const rewards = drawRewards(
            prizesWith({ spell: SPELL_ID }),
            catalog,
            new SequenceChance(),
        );

        expect(rewards.spellCandidate).toEqual({
            spellId: SPELL_ID,
            minXpToLearn: 4000,
            maxUsages: 4,
        });
    });

    it('drops an orphan spell', () => {
        const rewards = drawRewards(
            prizesWith({ spell: ORPHAN_SPELL_ID }),
            catalog,
            new SequenceChance(),
        );

        expect(rewards.spellCandidate).toBeNull();
    });
});

describe('drawRewards with a spell draw', () => {
    const drawCatalog: RewardCatalog = {
        ...catalog,
        spellPool: [SPELL_A, SPELL_B],
    };
    const lootPrizes = (overrides: PrizesSnapshot = {}): PrizesSnapshot =>
        prizesWith({
            randomLoot: [{ itemType: 'LootItem', item: BONE_ID, quantity: 1 }],
            ...overrides,
        });

    it('draws the spell gate and then the pick after the loot roll when the quest draws a spell (D-31, quick 261111-sdc)', () => {
        const chance = new SequenceChance([0.1, 0.2, 0.7]);

        const rewards = drawRewards(
            lootPrizes({ spellDraw: true }),
            drawCatalog,
            chance,
        );

        expect(rewards.items).toEqual([
            { itemType: 'LootItem', item: BONE_ID, quantity: 1 },
        ]);
        expect(rewards.spellDraw).toEqual({
            pool: [SPELL_A, SPELL_B],
            gate: 0.2,
            roll: 0.7,
        });
        expect(chance.drawn).toEqual([0.1, 0.2, 0.7]);
    });

    it('pins the spell draw chance at 30% (quick 261111-sdc)', () => {
        expect(SPELL_DRAW_CHANCE).toBe(0.3);
    });

    it('keeps a fixed spell prize out of the spell draw rolls (quick 261111-sdc)', () => {
        const chance = new SequenceChance([0.1, 0.9, 0.7]);

        const rewards = drawRewards(
            lootPrizes({ spell: SPELL_ID }),
            drawCatalog,
            chance,
        );

        expect(rewards.spellCandidate).toEqual({
            spellId: SPELL_ID,
            minXpToLearn: 4000,
            maxUsages: 4,
        });
        expect(rewards.spellDraw).toBeNull();
        expect(chance.drawn).toEqual([0.1]);
    });

    it('consumes no extra roll without the spell draw flag', () => {
        const chance = new SequenceChance([0.1, 0.7]);

        const rewards = drawRewards(lootPrizes(), drawCatalog, chance);

        expect(rewards.spellDraw).toBeNull();
        expect(chance.drawn).toEqual([0.1]);
    });

    it.each([['true'], [1], [null]])(
        'ignores a spell draw flag that is not the boolean true: %p (D-31)',
        (spellDraw) => {
            const chance = new SequenceChance([0.1, 0.7]);

            const rewards = drawRewards(
                lootPrizes({ spellDraw }),
                drawCatalog,
                chance,
            );

            expect(rewards.spellDraw).toBeNull();
            expect(chance.drawn).toEqual([0.1]);
        },
    );
});

describe('drawRewards with a pet prize', () => {
    const petCatalog: RewardCatalog = {
        ...catalog,
        spellPool: [SPELL_A],
        pets: new Map([[PET_ID.toHexString(), 450]]),
    };
    const petPrizes = (overrides: PrizesSnapshot = {}): PrizesSnapshot =>
        prizesWith({
            randomLoot: [{ itemType: 'LootItem', item: BONE_ID, quantity: 1 }],
            spellDraw: true,
            pet: PET_ID,
            ...overrides,
        });

    it('wins the pet prize on a roll below 20% after the loot and spell draws (D-21)', () => {
        const chance = new SequenceChance([0.1, 0.2, 0.7, 0.19]);

        const rewards = drawRewards(petPrizes(), petCatalog, chance);

        expect(rewards.pet).toEqual(PET_ID);
        expect(rewards.spellDraw).toEqual({
            pool: [SPELL_A],
            gate: 0.2,
            roll: 0.7,
        });
        expect(chance.drawn).toEqual([0.1, 0.2, 0.7, 0.19]);
    });

    it('carries the catalogue life points of the won pet as they are (D-03)', () => {
        const won = drawRewards(
            petPrizes(),
            petCatalog,
            new SequenceChance([0.1, 0.2, 0.7, 0.19]),
        );
        const malformed = drawRewards(
            petPrizes(),
            { ...petCatalog, pets: new Map([[PET_ID.toHexString(), '450']]) },
            new SequenceChance([0.1, 0.2, 0.7, 0.19]),
        );

        expect(won.petLifePoints).toBe(450);
        expect(malformed.pet).toEqual(PET_ID);
        expect(malformed.petLifePoints).toBe('450');
    });

    it('carries the lore of the won pet and none without the pet (D-26)', () => {
        const lore = [new Types.ObjectId(), new Types.ObjectId()];
        const storied = {
            ...petCatalog,
            petLore: new Map([[PET_ID.toHexString(), lore]]),
        };

        const won = drawRewards(
            petPrizes(),
            storied,
            new SequenceChance([0.1, 0.2, 0.7, 0.19]),
        );
        const lost = drawRewards(
            petPrizes(),
            storied,
            new SequenceChance([0.1, 0.2, 0.7, 0.2]),
        );
        const plain = drawRewards(
            petPrizes(),
            petCatalog,
            new SequenceChance([0.1, 0.2, 0.7, 0.19]),
        );

        expect(won.petLore).toEqual(lore);
        expect(lost.petLore).toEqual([]);
        expect(plain.petLore).toEqual([]);
    });

    it('loses the pet prize on a roll of 20% (D-21)', () => {
        const chance = new SequenceChance([0.1, 0.2, 0.7, 0.2]);

        const rewards = drawRewards(petPrizes(), petCatalog, chance);

        expect(rewards.pet).toBeNull();
        expect(rewards.petLifePoints).toBeNull();
        expect(chance.drawn).toEqual([0.1, 0.2, 0.7, 0.2]);
    });

    it('pins the pet win chance at 20% (D-21)', () => {
        expect(QUEST_PET_WIN_CHANCE).toBe(0.2);
    });

    it('skips the pet draw when the quest has no pet prize (D-21)', () => {
        const chance = new SequenceChance([0.1, 0.2, 0.7, 0.1]);

        const rewards = drawRewards(
            petPrizes({ pet: null }),
            petCatalog,
            chance,
        );

        expect(rewards.pet).toBeNull();
        expect(chance.drawn).toEqual([0.1, 0.2, 0.7]);
    });

    it('ignores an orphan pet prize without drawing (D-21)', () => {
        const chance = new SequenceChance([0.1, 0.2, 0.7, 0.1]);

        const rewards = drawRewards(
            petPrizes({ pet: ORPHAN_PET_ID }),
            petCatalog,
            chance,
        );

        expect(rewards.pet).toBeNull();
        expect(chance.drawn).toEqual([0.1, 0.2, 0.7]);
    });

    it('scales the pet chance by the share with the same draws (D-20)', () => {
        const halved = new SequenceChance([0.9, 0.2, 0.7, 0.15]);
        const full = new SequenceChance([0.9, 0.2, 0.7, 0.15]);

        const shared = drawRewards(petPrizes(), petCatalog, halved, 0.5);
        const whole = drawRewards(petPrizes(), petCatalog, full, 1);

        expect(shared.pet).toBeNull();
        expect(whole.pet).toEqual(PET_ID);
        expect(halved.drawn).toEqual(full.drawn);
    });

    it('draws as today without a share (D-14)', () => {
        const chance = new SequenceChance([0.1, 0.2, 0.7, 0.15]);

        const rewards = drawRewards(petPrizes(), petCatalog, chance);

        expect(rewards.pet).toEqual(PET_ID);
        expect(rewards.items).toEqual([
            { itemType: 'LootItem', item: BONE_ID, quantity: 1 },
        ]);
        expect(chance.drawn).toEqual([0.1, 0.2, 0.7, 0.15]);
    });
});

describe('drawRewards with a study lore pool', () => {
    const loreCatalog: RewardCatalog = {
        ...catalog,
        studyLorePool: [LORE_1, LORE_2],
        studyLoreChance: 0.5,
    };

    it('draws the study gate and pick after the pet only with a pool (D-08)', () => {
        const chance = new SequenceChance([0.2, 0.7]);

        const rewards = drawRewards(prizesWith({}), loreCatalog, chance);

        expect(rewards.loreDraw).toEqual({
            pool: [LORE_1, LORE_2],
            chance: 0.5,
            gate: 0.2,
            pick: 0.7,
        });
        expect(chance.drawn).toEqual([0.2, 0.7]);
    });

    it('queues the study draws after the loot, spell and pet draws (D-08)', () => {
        const chance = new SequenceChance([0.1, 0.2, 0.7, 0.19, 0.3, 0.4]);

        const rewards = drawRewards(
            prizesWith({
                randomLoot: [
                    { itemType: 'LootItem', item: BONE_ID, quantity: 1 },
                ],
                spellDraw: true,
                pet: PET_ID,
            }),
            { ...loreCatalog, pets: new Map([[PET_ID.toHexString(), 450]]) },
            chance,
        );

        expect(rewards.pet).toEqual(PET_ID);
        expect(rewards.loreDraw).toMatchObject({ gate: 0.3, pick: 0.4 });
        expect(chance.drawn).toEqual([0.1, 0.2, 0.7, 0.19, 0.3, 0.4]);
    });

    it.each([
        ['without a pool', catalog],
        ['with an empty pool', { ...catalog, studyLorePool: [] }],
    ])(
        'consumes no study roll %s (D-08)',
        (_label, withoutPool: RewardCatalog) => {
            const chance = new SequenceChance([0.2, 0.7]);

            const rewards = drawRewards(prizesWith({}), withoutPool, chance);

            expect(rewards.loreDraw).toBeNull();
            expect(chance.drawn).toEqual([]);
        },
    );

    it('falls back to the default study chance when the catalog has none (D-08)', () => {
        const rewards = drawRewards(
            prizesWith({}),
            { ...catalog, studyLorePool: [LORE_1] },
            new SequenceChance([0.2, 0.7]),
        );

        expect(rewards.loreDraw?.chance).toBe(0.5);
    });
});

describe('drawStudyLore', () => {
    const draw = (gate: number, pick: number) => ({
        pool: [LORE_1, LORE_2, LORE_3],
        chance: 0.5,
        gate,
        pick,
    });

    it('picks an unknown study lore when the gate passes (D-08)', () => {
        expect(drawStudyLore(draw(0.1, 0.99), [LORE_1])).toEqual(LORE_3);
        expect(drawStudyLore(draw(0.1, 0), [LORE_1])).toEqual(LORE_2);
    });

    it('treats a known lore stored as a legacy string as known (D-08)', () => {
        expect(drawStudyLore(draw(0.1, 0), [LORE_1.toHexString()])).toEqual(
            LORE_2,
        );
    });

    it('learns nothing when the gate reaches the chance (D-08)', () => {
        expect(drawStudyLore(draw(0.5, 0), [])).toBeNull();
    });

    it('learns nothing when every lore of the pool is excluded (D-08)', () => {
        expect(
            drawStudyLore(draw(0.1, 0), [LORE_3, LORE_2, LORE_1]),
        ).toBeNull();
    });

    it('learns nothing without a draw (D-08)', () => {
        expect(drawStudyLore(null, [])).toBeNull();
    });

    it('clamps a pick out of range onto the last candidate (D-08)', () => {
        expect(drawStudyLore(draw(0.1, 1), [LORE_3])).toEqual(LORE_2);
    });
});

describe('drawLearnableSpell', () => {
    it('picks among the unknown spells the xp after the prizes can learn (D-31)', () => {
        const draw = { pool: [SPELL_A, SPELL_B, SPELL_C], gate: 0, roll: 0 };

        expect(
            drawLearnableSpell(draw, 400, [SPELL_A.spellId], TitleType.mage),
        ).toEqual(SPELL_B);
    });

    it('treats a known spell stored as a legacy string as known (D-31)', () => {
        const draw = { pool: [SPELL_A, SPELL_B], gate: 0, roll: 0 };

        expect(
            drawLearnableSpell(
                draw,
                400,
                [SPELL_A.spellId.toHexString()],
                TitleType.mage,
            ),
        ).toEqual(SPELL_B);
    });

    it('returns no spell when nothing is learnable (D-31)', () => {
        const draw = { pool: [SPELL_A, SPELL_B, SPELL_C], gate: 0, roll: 0 };

        expect(drawLearnableSpell(draw, 50, [], TitleType.mage)).toBeNull();
    });

    it('maps the roll onto the learnable spells only (D-31)', () => {
        const pool = [SPELL_A, SPELL_C, SPELL_B, SPELL_D];

        expect(
            drawLearnableSpell(
                { pool, gate: 0, roll: 0.99 },
                400,
                [],
                TitleType.mage,
            ),
        ).toEqual(SPELL_D);
        expect(
            drawLearnableSpell(
                { pool, gate: 0, roll: 0.34 },
                400,
                [],
                TitleType.mage,
            ),
        ).toEqual(SPELL_B);
    });

    it('teaches a learnable spell when the gate falls below 30% (quick 261111-sdc)', () => {
        const draw = { pool: [SPELL_A, SPELL_B], gate: 0.29, roll: 0 };

        expect(drawLearnableSpell(draw, 400, [], TitleType.mage)).toEqual(
            SPELL_A,
        );
    });

    it.each([[0.3], [0.31], [0.99]])(
        'teaches no spell with a learnable pool when the gate is %p (quick 261111-sdc)',
        (gate) => {
            const draw = { pool: [SPELL_A, SPELL_B], gate, roll: 0 };

            expect(
                drawLearnableSpell(draw, 400, [], TitleType.mage),
            ).toBeNull();
        },
    );

    it('returns no spell without a draw', () => {
        expect(drawLearnableSpell(null, 50000, [], TitleType.mage)).toBeNull();
    });

    it('clamps a roll out of range onto the last learnable spell', () => {
        const draw = { pool: [SPELL_A, SPELL_B, SPELL_D], gate: 0, roll: 1 };

        expect(drawLearnableSpell(draw, 400, [], TitleType.mage)).toEqual(
            SPELL_D,
        );
    });
});

describe('canLearnSpell', () => {
    const candidate = { spellId: SPELL_ID, minXpToLearn: 4000, maxUsages: 4 };

    it('teaches the spell once the experience reaches the threshold', () => {
        expect(canLearnSpell(candidate, 4000, [], TitleType.mage)).toBe(
            SPELL_ID,
        );
    });

    it('does not teach it below the threshold', () => {
        expect(canLearnSpell(candidate, 3999, [], TitleType.mage)).toBeNull();
    });

    it('does not teach a spell already known, even as a legacy string', () => {
        expect(
            canLearnSpell(
                candidate,
                50000,
                [SPELL_ID.toHexString()],
                TitleType.mage,
            ),
        ).toBeNull();
    });

    it('teaches nothing without a candidate', () => {
        expect(canLearnSpell(null, 50000, [], TitleType.mage)).toBeNull();
    });
});

describe('spell learning by title', () => {
    const candidate = { spellId: SPELL_ID, minXpToLearn: 4000, maxUsages: 4 };
    const draw = { pool: [SPELL_A, SPELL_B], gate: 0.1, roll: 0.99 };

    it.each([
        [TitleType.rookie, null],
        [TitleType.adventurer, null],
        [TitleType.paladin, null],
        [TitleType.mage, SPELL_ID],
        [TitleType.hero, SPELL_ID],
        [TitleType.legend, SPELL_ID],
        [null, null],
        [undefined, null],
    ])(
        'teaches a fixed spell only to a caster title (D-05b, D-25): %p',
        (title, expected) => {
            expect(canLearnSpell(candidate, 50000, [], title)).toBe(expected);
        },
    );

    it.each([
        [TitleType.rookie, null],
        [TitleType.paladin, null],
        [TitleType.mage, SPELL_B],
    ])(
        'draws a learnable spell only for a caster title (D-05b, D-25): %p',
        (title, expected) => {
            expect(drawLearnableSpell(draw, 400, [], title)).toEqual(expected);
        },
    );

    it('keeps the xp and known spell gates for casters (D-05b)', () => {
        expect(canLearnSpell(candidate, 3999, [], TitleType.mage)).toBeNull();
        expect(
            canLearnSpell(candidate, 50000, [SPELL_ID], TitleType.mage),
        ).toBeNull();
        expect(drawLearnableSpell(draw, 50, [], TitleType.mage)).toBeNull();
        expect(
            drawLearnableSpell(
                draw,
                400,
                [SPELL_A.spellId, SPELL_B.spellId],
                TitleType.mage,
            ),
        ).toBeNull();
    });
});

describe('drawRewards cure', () => {
    it('carries the cure of the drawn block without drawing (D-05)', () => {
        const cure = { lifePointsShare: 0.5, canHeal: ['deepCut'] };
        const withCure = new SequenceChance([0.1, 0.2, 0.3]);
        const withoutCure = new SequenceChance([0.1, 0.2, 0.3]);
        const prizes = prizesWith({
            randomLoot: [{ itemType: 'LootItem', item: BONE_ID, quantity: 1 }],
        });

        const rewards = drawRewards({ ...prizes, cure }, catalog, withCure);
        drawRewards(prizes, catalog, withoutCure);

        expect(rewards.cure).toBe(cure);
        expect(withCure.drawn).toEqual(withoutCure.drawn);
    });
});

describe('rewardRefsOf', () => {
    it('lists the formally valid item refs and the spell for the catalog reads', () => {
        const prizes = prizesWith({
            prizeItem: {
                itemType: 'EquipmentItem',
                item: POTION_ID,
                quantity: 1,
            },
            randomLoot: [
                {
                    itemType: 'LootItem',
                    item: BONE_ID.toHexString(),
                    quantity: 2,
                },
                { itemType: 'Pet', item: ORPHAN_ID, quantity: 1 },
                { itemType: 'LootItem', item: ORPHAN_ID, quantity: 0 },
            ],
            spell: SPELL_ID,
        });

        expect(rewardRefsOf([prizes])).toEqual({
            items: [
                { itemType: 'EquipmentItem', item: POTION_ID },
                { itemType: 'LootItem', item: BONE_ID },
            ],
            spellIds: [SPELL_ID],
            petIds: [],
        });
    });

    it('lists the pet prize ref for the catalog reads (D-21)', () => {
        expect(rewardRefsOf([prizesWith({ pet: PET_ID })]).petIds).toEqual([
            PET_ID,
        ]);
    });

    it('collects the refs of a single block like today (D-01)', () => {
        const prizes = prizesWith({
            randomLoot: [{ itemType: 'LootItem', item: BONE_ID, quantity: 1 }],
            spell: SPELL_ID,
            pet: PET_ID,
        });

        expect(rewardRefsOf([prizes])).toEqual({
            items: [{ itemType: 'LootItem', item: BONE_ID }],
            spellIds: [SPELL_ID],
            petIds: [PET_ID],
        });
    });

    it('collects the refs of every rank block once (D-05, D-05a)', () => {
        const mage = prizesWith({
            randomLoot: [{ itemType: 'LootItem', item: BONE_ID, quantity: 1 }],
            spell: SPELL_ID,
            pet: PET_ID,
        });
        const paladin = prizesWith({
            prizeItem: {
                itemType: 'LootItem',
                item: BONE_ID.toHexString(),
                quantity: 3,
            },
            randomLoot: [{ itemType: 'LootItem', item: BONE_ID, quantity: 2 }],
            spell: SPELL_ID.toHexString(),
            pet: ORPHAN_PET_ID,
        });

        expect(rewardRefsOf([mage, paladin])).toEqual({
            items: [{ itemType: 'LootItem', item: BONE_ID }],
            spellIds: [SPELL_ID],
            petIds: [PET_ID, ORPHAN_PET_ID],
        });
    });

    it('ignores absent blocks (D-01)', () => {
        const none = { items: [], spellIds: [], petIds: [] };

        expect(rewardRefsOf([])).toEqual(none);
        expect(rewardRefsOf([null])).toEqual(none);
    });
});

describe('validRewardItems', () => {
    it('lists the valid entries of a prize block in order (D-22)', () => {
        const prizes = prizesWith({
            prizeItem: {
                itemType: 'EquipmentItem',
                item: POTION_ID,
                quantity: 1,
            },
            randomLoot: [
                { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
                { itemType: 'LootItem', item: ORPHAN_ID, quantity: 0 },
                { itemType: 'Pet', item: ORPHAN_ID, quantity: 1 },
            ],
        });

        expect(validRewardItems(prizes)).toEqual([
            { itemType: 'EquipmentItem', item: POTION_ID, quantity: 1 },
            { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
        ]);
    });
});
