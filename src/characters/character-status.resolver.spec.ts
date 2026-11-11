import { CharacterStatus } from 'src/models/character/character-status.model';
import { TitleType } from 'src/models/enums/title-type.enum';
import { CharacterStatusResolver } from './character-status.resolver';

const SLOTS_BY_XP_AND_TITLE: Array<[number, TitleType, number]> = [
    [40000, TitleType.rookie, 0],
    [20000, TitleType.mage, 1],
    [40000, TitleType.legend, 4],
];

function statusOf(fields: Partial<CharacterStatus>): CharacterStatus {
    return fields as CharacterStatus;
}

describe('CharacterStatusResolver', () => {
    const resolver = new CharacterStatusResolver();

    it.each(SLOTS_BY_XP_AND_TITLE)(
        'resolves the active spell slots of %i xp as %s to %i (D-08)',
        (xp, title, slots) => {
            expect(resolver.maxActiveSpells(statusOf({ xp, title }))).toBe(
                slots,
            );
        },
    );

    it('reads a status without xp as 0 xp (D-08)', () => {
        expect(
            resolver.maxActiveSpells(statusOf({ title: TitleType.legend })),
        ).toBe(0);
    });
});
