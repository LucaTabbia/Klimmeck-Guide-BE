import { Types } from 'mongoose';
import { geographyOf } from 'src/lore/lore-geography';
import { LoreType } from 'src/models/enums/lore-type.enum';

const loreOf = (type: LoreType) => ({ _id: new Types.ObjectId(), type });

describe('lore geography', () => {
    const city = loreOf(LoreType.city);
    const firstRegion = loreOf(LoreType.region);
    const secondRegion = loreOf(LoreType.region);
    const state = loreOf(LoreType.state);
    const person = loreOf(LoreType.character);
    const religion = loreOf(LoreType.religion);

    it('opens the city lore with its regions and its state (D-03)', () => {
        expect(
            geographyOf(city, [
                firstRegion,
                person,
                state,
                secondRegion,
                religion,
            ]),
        ).toEqual([city._id, firstRegion._id, state._id, secondRegion._id]);
    });

    it('never cascades to the other related lore (D-03)', () => {
        expect(geographyOf(city, [person, religion])).toEqual([city._id]);
    });

    it('opens nothing without a city lore (D-03)', () => {
        expect(geographyOf(null, [firstRegion])).toEqual([]);
    });

    it('keeps each lore once (D-03)', () => {
        expect(geographyOf(city, [firstRegion, firstRegion, city])).toEqual([
            city._id,
            firstRegion._id,
        ]);
    });
});
