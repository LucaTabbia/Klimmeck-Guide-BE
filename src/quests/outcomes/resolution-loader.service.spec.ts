import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { ResolutionLoader } from './resolution-loader.service';

const AMBUSH_SUBJECT = "dell'imboscata x";

const fakeModel = (entries: readonly unknown[] = []) => ({
    find: jest.fn(() => ({
        lean: () => ({ exec: () => Promise.resolve(entries) }),
    })),
});

// solo i modelli del catalogo del combattimento: nemici, loot, equipaggiamento, magie
const loaderWith = (enemyModel: ReturnType<typeof fakeModel>) =>
    new ResolutionLoader(
        null as never,
        null as never,
        null as never,
        null as never,
        enemyModel as never,
        fakeModel() as never,
        fakeModel() as never,
        fakeModel() as never,
        null as never,
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
                baseWeaknesses: 1,
                energyWeaknesses: 1,
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
            baseWeaknesses: [],
            energyWeaknesses: [],
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
            spellMaxUsages: new Map(),
        });
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
});
