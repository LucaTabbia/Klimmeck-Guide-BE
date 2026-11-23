import { Types } from 'mongoose';
import {
    creaturesByOwnLore,
    knowsEnemyByOwnLore,
    ownLoreHexOf,
    visibleLoreHexOf,
} from 'src/lore/lore-creature';
import { SEES_EVERYTHING, visibilityOf } from 'src/lore/lore-visibility';

describe('the creature of a lore (quick 261123-lcv)', () => {
    const unlocked = new Types.ObjectId();
    const locked = new Types.ObjectId();
    const shared = new Types.ObjectId();
    const viewer = visibilityOf({ unlockedLore: [unlocked, shared] });

    function creatureOf(
        lore: Types.ObjectId,
        creatures: { _id: Types.ObjectId; relatedLore?: unknown }[],
        visibility = viewer,
    ) {
        const hex = visibleLoreHexOf(visibility, { _id: lore });
        if (hex === undefined) return null;
        return creaturesByOwnLore(creatures).byLore.get(hex) ?? null;
    }

    it('serves the creature of an unlocked lore', () => {
        const wolf = { _id: new Types.ObjectId(), relatedLore: [unlocked] };

        expect(creatureOf(unlocked, [wolf])).toBe(wolf);
    });

    it('serves no creature of a locked lore', () => {
        const wolf = { _id: new Types.ObjectId(), relatedLore: [locked] };

        expect(visibleLoreHexOf(viewer, { _id: locked })).toBeUndefined();
        expect(creatureOf(locked, [wolf])).toBeNull();
    });

    it('serves the creature of every lore to the innkeeper', () => {
        const wolf = { _id: new Types.ObjectId(), relatedLore: [locked] };

        expect(creatureOf(locked, [wolf], SEES_EVERYTHING)).toBe(wolf);
    });

    it('serves no creature of a lore that belongs to none', () => {
        const wolf = { _id: new Types.ObjectId(), relatedLore: [locked] };

        expect(creatureOf(unlocked, [wolf])).toBeNull();
        expect(creatureOf(unlocked, [])).toBeNull();
    });

    it('owns only the first lore of a creature: «Goblin» is of the goblin, not of its chief', () => {
        const goblin = { _id: new Types.ObjectId(), relatedLore: [shared] };
        const chief = {
            _id: new Types.ObjectId('000000000000000000000001'),
            relatedLore: [unlocked, shared],
        };

        const { byLore, contested } = creaturesByOwnLore([chief, goblin]);

        expect(byLore.get(shared.toHexString())).toBe(goblin);
        expect(byLore.get(unlocked.toHexString())).toBe(chief);
        expect(byLore.size).toBe(2);
        expect(contested).toEqual([]);
    });

    it('serves no creature of a lore that is only the second of some creature', () => {
        const chief = {
            _id: new Types.ObjectId(),
            relatedLore: [unlocked, shared],
        };

        expect(creatureOf(shared, [chief])).toBeNull();
    });

    it('picks the smallest id when two creatures own the same lore, whatever the order, and reports it', () => {
        const first = {
            _id: new Types.ObjectId('000000000000000000000001'),
            relatedLore: [unlocked],
        };
        const second = {
            _id: new Types.ObjectId('000000000000000000000002'),
            relatedLore: [unlocked],
        };

        expect(creatureOf(unlocked, [second, first])).toBe(first);
        expect(creatureOf(unlocked, [first, second])).toBe(first);
        expect(creaturesByOwnLore([second, first]).contested).toEqual([
            unlocked.toHexString(),
        ]);
    });

    it('reads every form of the own lore ref: id, hex string, populated document', () => {
        const hex = unlocked.toHexString();

        expect(ownLoreHexOf({ relatedLore: [unlocked, locked] })).toBe(hex);
        expect(ownLoreHexOf({ relatedLore: [hex] })).toBe(hex);
        expect(ownLoreHexOf({ relatedLore: [{ _id: unlocked }] })).toBe(hex);
    });

    it('reads no own lore on a creature without lore, without the field, or with an unreadable first entry', () => {
        expect(ownLoreHexOf({ relatedLore: [] })).toBeUndefined();
        expect(ownLoreHexOf({})).toBeUndefined();
        expect(ownLoreHexOf(null)).toBeUndefined();
        expect(ownLoreHexOf(new Types.ObjectId())).toBeUndefined();
        expect(
            ownLoreHexOf({ relatedLore: ['not-an-id', unlocked] }),
        ).toBeUndefined();
        expect(ownLoreHexOf({ relatedLore: [null, unlocked] })).toBeUndefined();
    });

    it('reads the id of a lore served as a document or as a bare id', () => {
        expect(visibleLoreHexOf(viewer, unlocked)).toBe(unlocked.toHexString());
        expect(visibleLoreHexOf(viewer, { _id: unlocked })).toBe(
            unlocked.toHexString(),
        );
        expect(visibleLoreHexOf(viewer, null)).toBeUndefined();
    });
});

describe('whether the viewer knows an enemy (quick 261123-lcv)', () => {
    const chiefLore = new Types.ObjectId();
    const goblinLore = new Types.ObjectId();
    const shamanLore = new Types.ObjectId();
    const chief = {
        _id: new Types.ObjectId(),
        relatedLore: [chiefLore, goblinLore],
    };
    const goblin = { _id: new Types.ObjectId(), relatedLore: [goblinLore] };
    const shaman = {
        _id: new Types.ObjectId(),
        relatedLore: [shamanLore, goblinLore],
    };

    it('knows the enemies whose own lore is unlocked: the chief and the goblin, not the shaman', () => {
        const winner = visibilityOf({
            unlockedLore: [chiefLore, goblinLore],
            knownEnemies: [chief._id],
        });

        expect(knowsEnemyByOwnLore(winner, chief)).toBe(true);
        expect(knowsEnemyByOwnLore(winner, goblin)).toBe(true);
        expect(knowsEnemyByOwnLore(winner, shaman)).toBe(false);
    });

    it('knows an enemy whose lore was unlocked without a fight, as by buying the pet of the same lore', () => {
        const buyer = visibilityOf({ unlockedLore: [goblinLore] });

        expect(knowsEnemyByOwnLore(buyer, goblin)).toBe(true);
    });

    it('does not know a defeated enemy whose own lore is locked: the sheet says what the bestiary says', () => {
        const winner = visibilityOf({
            unlockedLore: [goblinLore],
            knownEnemies: [shaman._id],
        });

        expect(knowsEnemyByOwnLore(winner, shaman)).toBe(false);
    });

    it('falls back on the defeated enemies for an enemy without an own lore', () => {
        const loreless = { _id: new Types.ObjectId(), relatedLore: [] };
        const fieldless = { _id: new Types.ObjectId() };
        const bare = new Types.ObjectId();
        const winner = visibilityOf({
            knownEnemies: [loreless._id, fieldless._id, bare],
        });
        const stranger = visibilityOf({ unlockedLore: [goblinLore] });

        expect(knowsEnemyByOwnLore(winner, loreless)).toBe(true);
        expect(knowsEnemyByOwnLore(winner, fieldless)).toBe(true);
        expect(knowsEnemyByOwnLore(winner, bare)).toBe(true);
        expect(knowsEnemyByOwnLore(stranger, loreless)).toBe(false);
    });

    it('knows every enemy as who sees everything, and none as who sees nothing', () => {
        expect(knowsEnemyByOwnLore(SEES_EVERYTHING, shaman)).toBe(true);
        expect(knowsEnemyByOwnLore(visibilityOf(null), goblin)).toBe(false);
    });
});
