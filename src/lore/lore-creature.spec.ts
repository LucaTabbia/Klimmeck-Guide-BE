import { Types } from 'mongoose';
import { creaturesByLore, visibleLoreHexOf } from 'src/lore/lore-creature';
import { SEES_EVERYTHING, visibilityOf } from 'src/lore/lore-visibility';

describe('the creature of a lore (quick 261123-lcv)', () => {
    const unlocked = new Types.ObjectId();
    const locked = new Types.ObjectId();
    const viewer = visibilityOf({ unlockedLore: [unlocked] });

    function creatureOf(
        lore: Types.ObjectId,
        creatures: { _id: Types.ObjectId; relatedLore?: unknown }[],
        visibility = viewer,
    ) {
        const hex = visibleLoreHexOf(visibility, { _id: lore });
        if (hex === undefined) return null;
        return creaturesByLore(creatures).get(hex) ?? null;
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

    it('picks the smallest id when more creatures share a lore, whatever the order', () => {
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
    });

    it('reads every form of a lore ref: id, hex string, populated document', () => {
        const other = new Types.ObjectId();
        const third = new Types.ObjectId();
        const wolf = {
            _id: new Types.ObjectId(),
            relatedLore: [
                unlocked.toHexString(),
                { _id: other, name: 'x' },
                third,
                null,
                'not-an-id',
            ],
        };

        const byLore = creaturesByLore([wolf]);

        expect([...byLore.keys()].sort()).toEqual(
            [unlocked, other, third].map((id) => id.toHexString()).sort(),
        );
    });

    it('reads a creature written without the field as a creature without lore', () => {
        expect(creaturesByLore([{ _id: new Types.ObjectId() }]).size).toBe(0);
    });

    it('reads the id of a lore served as a document or as a bare id', () => {
        expect(visibleLoreHexOf(viewer, unlocked)).toBe(unlocked.toHexString());
        expect(visibleLoreHexOf(viewer, { _id: unlocked })).toBe(
            unlocked.toHexString(),
        );
        expect(visibleLoreHexOf(viewer, null)).toBeUndefined();
    });
});
