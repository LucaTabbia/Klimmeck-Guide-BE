import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { ResolutionLoader } from './resolution-loader.service';

const AMBUSH_SUBJECT = "dell'imboscata x";

const fakeModel = (entries: readonly unknown[] = []) => ({
    find: jest.fn(() => ({
        lean: () => ({ exec: () => Promise.resolve(entries) }),
    })),
});

// solo i modelli del catalogo del combattimento: nemici, loot, equipaggiamento, magie, pet, lore dello studio
const loaderWith = (
    enemyModel: ReturnType<typeof fakeModel>,
    petModel: ReturnType<typeof fakeModel> = fakeModel(),
) =>
    new ResolutionLoader(
        null as never,
        null as never,
        null as never,
        null as never,
        enemyModel as never,
        fakeModel() as never,
        fakeModel() as never,
        fakeModel() as never,
        petModel as never,
        fakeModel() as never,
        undefined,
    );

describe('ResolutionLoader enemy read', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('projects the enemies on the fields of the combat snapshot (D-10)', async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        const enemyModel = fakeModel();
        const loader = loaderWith(enemyModel);
        const enemy = new Types.ObjectId();

        await loader.readCombatCatalog(
            [{ enemy, quantity: 2 }],
            [],
            'della missione x',
        );

        expect(enemyModel.find).toHaveBeenCalledWith(
            { _id: { $in: [enemy] } },
            {
                name: 1,
                lifePoints: 1,
                xp: 1,
                damages: 1,
                weaknesses: 1,
                relatedLore: 1,
            },
        );
    });

    it('reads the combat catalog of composed enemies without a quest (D-09)', async () => {
        const idA = new Types.ObjectId();
        const snapshot = {
            _id: idA,
            name: 'Lupo',
            lifePoints: 11,
            xp: 5,
            damages: [],
            weaknesses: { base: [], energy: [] },
        };
        const loader = loaderWith(fakeModel([snapshot]));

        const catalog = await loader.readCombatCatalog(
            [{ enemy: idA, quantity: 2 }],
            [],
            AMBUSH_SUBJECT,
        );

        expect(catalog).toEqual({
            enemies: [{ snapshot, quantity: 2 }],
            equipment: new Map(),
            spells: new Map(),
            loot: new Map(),
            recoveryTimes: new Map(),
            petMaxXp: new Map(),
        });
    });

    it('carries no spell usages catalogue in the combat catalog (D-07)', async () => {
        const enemy = { _id: new Types.ObjectId(), name: 'Lupo', xp: 5 };
        const withEnemies = await loaderWith(
            fakeModel([enemy]),
        ).readCombatCatalog(
            [{ enemy: enemy._id, quantity: 1 }],
            [],
            AMBUSH_SUBJECT,
        );
        const withoutEnemies = await loaderWith(fakeModel()).readCombatCatalog(
            [],
            [],
            AMBUSH_SUBJECT,
        );

        const keys = [
            'enemies',
            'equipment',
            'loot',
            'petMaxXp',
            'recoveryTimes',
            'spells',
        ];
        expect(Object.keys(withEnemies).sort()).toEqual(keys);
        expect(Object.keys(withoutEnemies).sort()).toEqual(keys);
    });

    it('drops an orphan ambush enemy with an id only warning (D-09)', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => {});
        const orphan = new Types.ObjectId();
        const loader = loaderWith(fakeModel());

        const catalog = await loader.readCombatCatalog(
            [{ enemy: orphan, quantity: 1 }],
            [],
            AMBUSH_SUBJECT,
        );

        expect(catalog.enemies).toEqual([]);
        expect(warn.mock.calls).toEqual([
            [
                `Nemico ${orphan.toHexString()} ${AMBUSH_SUBJECT} inesistente: voce scartata`,
            ],
        ]);
    });

    it('reads the xp caps of the whole pet catalogue (D-17)', async () => {
        const wolf = new Types.ObjectId();
        const dragon = new Types.ObjectId();
        const petModel = fakeModel([
            { _id: wolf, maxXp: 100 },
            { _id: dragon, maxXp: 2350 },
            { _id: new Types.ObjectId() },
        ]);
        const enemy = { _id: new Types.ObjectId(), name: 'Lupo', xp: 5 };
        const loader = loaderWith(fakeModel([enemy]), petModel);

        const catalog = await loader.readCombatCatalog(
            [{ enemy: enemy._id, quantity: 1 }],
            [],
            AMBUSH_SUBJECT,
        );

        expect(catalog.petMaxXp).toEqual(
            new Map([
                [wolf.toHexString(), 100],
                [dragon.toHexString(), 2350],
            ]),
        );
        expect(petModel.find.mock.calls).toEqual([[{}, { maxXp: 1 }]]);
    });

    it('leaves a pet without a valid cap out of the caps (D-17)', async () => {
        const valid = new Types.ObjectId();
        const petModel = fakeModel([
            { _id: new Types.ObjectId(), maxXp: 0 },
            { _id: new Types.ObjectId(), maxXp: -100 },
            { _id: new Types.ObjectId(), maxXp: 12.5 },
            { _id: new Types.ObjectId(), maxXp: '100' },
            { _id: new Types.ObjectId(), maxXp: null },
            { _id: new Types.ObjectId(), maxXp: NaN },
            { _id: valid, maxXp: 1 },
        ]);
        const enemy = { _id: new Types.ObjectId(), name: 'Lupo', xp: 5 };
        const loader = loaderWith(fakeModel([enemy]), petModel);

        const catalog = await loader.readCombatCatalog(
            [{ enemy: enemy._id, quantity: 1 }],
            [],
            AMBUSH_SUBJECT,
        );

        expect(catalog.petMaxXp).toEqual(new Map([[valid.toHexString(), 1]]));
    });

    it('returns the pet caps even without enemies (D-17)', async () => {
        const wolf = new Types.ObjectId();
        const petModel = fakeModel([{ _id: wolf, maxXp: 100 }]);
        const loader = loaderWith(fakeModel(), petModel);

        const catalog = await loader.readCombatCatalog(
            [],
            [],
            'della missione x',
        );

        expect(catalog.enemies).toEqual([]);
        expect(catalog.petMaxXp).toEqual(new Map([[wolf.toHexString(), 100]]));
    });
});

type CatalogDoc = { _id: Types.ObjectId } & Record<string, unknown>;

// risponde al filtro sugli id come il driver; un filtro senza id restituisce tutto il catalogo
const catalogModel = (entries: readonly CatalogDoc[] = []) => ({
    find: jest.fn((filter: { _id?: { $in: Types.ObjectId[] } }) => {
        const wanted = filter._id?.$in.map((id) => id.toHexString());
        const found = wanted
            ? entries.filter(({ _id }) => wanted.includes(_id.toHexString()))
            : entries;
        return { lean: () => ({ exec: () => Promise.resolve(found) }) };
    }),
});

const rewardLoaderWith = (models: {
    loot?: CatalogDoc[];
    equipment?: CatalogDoc[];
    spells?: CatalogDoc[];
    pets?: CatalogDoc[];
}) =>
    new ResolutionLoader(
        null as never,
        null as never,
        null as never,
        null as never,
        catalogModel() as never,
        catalogModel(models.loot) as never,
        catalogModel(models.equipment) as never,
        catalogModel(models.spells) as never,
        catalogModel(models.pets) as never,
        catalogModel() as never,
        undefined,
    );

const rankedBoss = (rankPrizes: Record<string, unknown>[]) => ({
    _id: new Types.ObjectId(),
    infos: { type: QuestType.boss, title: 'Boss', markerLocation: null },
    requirements: { minTitle: TitleType.paladin },
    prizes: { prizeCoins: null, xpPrize: 10, randomLoot: [], rankPrizes },
});

describe('ResolutionLoader reward catalog', () => {
    it('reads the reward catalog of every rank block (D-05, D-05a)', async () => {
        const P1 = new Types.ObjectId();
        const P2 = new Types.ObjectId();
        const L1 = new Types.ObjectId();
        const E1 = new Types.ObjectId();
        const loader = rewardLoaderWith({
            loot: [{ _id: L1, rarity: RarityType.rare }],
            equipment: [{ _id: E1, rarity: RarityType.common }],
            pets: [{ _id: P1, maxLifePoints: 30, relatedLore: [] }],
        });
        const quest = rankedBoss([
            {
                title: TitleType.mage,
                pet: P1,
                randomLoot: [{ itemType: 'LootItem', item: L1, quantity: 1 }],
            },
            {
                title: TitleType.paladin,
                pet: P2,
                randomLoot: [
                    { itemType: 'EquipmentItem', item: E1, quantity: 1 },
                ],
            },
        ]);

        const { rewards } = await loader.readCatalog(quest as never, []);

        expect([...rewards.pets.keys()]).toEqual([P1.toHexString()]);
        expect(Object.fromEntries(rewards.rarities)).toEqual({
            [`LootItem:${L1.toHexString()}`]: RarityType.rare,
            [`EquipmentItem:${E1.toHexString()}`]: RarityType.common,
        });
    });

    it('reads the fixed spells of every rank block (D-05)', async () => {
        const S1 = new Types.ObjectId();
        const S2 = new Types.ObjectId();
        const loader = rewardLoaderWith({
            spells: [
                { _id: S1, minXpToLearn: 100, maxUsages: 2 },
                { _id: S2, minXpToLearn: 300, maxUsages: 1 },
            ],
        });
        const quest = rankedBoss([
            { title: TitleType.mage, spell: S1 },
            { title: TitleType.paladin, spell: S2 },
        ]);

        const { rewards } = await loader.readCatalog(quest as never, []);

        expect(Object.fromEntries(rewards.spells)).toEqual({
            [S1.toHexString()]: { minXpToLearn: 100, maxUsages: 2 },
            [S2.toHexString()]: { minXpToLearn: 300, maxUsages: 1 },
        });
    });

    it('reads the reward catalogue of arbitrary refs without a quest (D-22)', async () => {
        const L1 = new Types.ObjectId();
        const E1 = new Types.ObjectId();
        const S1 = new Types.ObjectId();
        const P1 = new Types.ObjectId();
        const loader = rewardLoaderWith({
            loot: [{ _id: L1, rarity: RarityType.uncommon }],
            equipment: [{ _id: E1, rarity: RarityType.rare }],
            spells: [{ _id: S1, minXpToLearn: 200, maxUsages: 3 }],
            pets: [{ _id: P1, maxLifePoints: 40, relatedLore: [] }],
        });

        const rewards = await loader.readRewardCatalogFor(
            {
                items: [
                    { itemType: 'LootItem', item: L1 },
                    { itemType: 'EquipmentItem', item: E1 },
                ],
                spellIds: [S1],
                petIds: [P1],
            },
            null,
        );

        expect(Object.fromEntries(rewards.rarities)).toEqual({
            [`LootItem:${L1.toHexString()}`]: RarityType.uncommon,
            [`EquipmentItem:${E1.toHexString()}`]: RarityType.rare,
        });
        expect(Object.fromEntries(rewards.spells)).toEqual({
            [S1.toHexString()]: { minXpToLearn: 200, maxUsages: 3 },
        });
        expect(Object.fromEntries(rewards.pets)).toEqual({
            [P1.toHexString()]: 40,
        });
        expect(rewards.spellPool).toEqual([]);
    });
});
