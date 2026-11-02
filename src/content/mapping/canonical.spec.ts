import { ObjectId } from 'mongodb';
import { assertNoUndefined, toObjectId } from 'src/content/mapping/canonical';

const REGION_ID = '64b0000000000000000000a1';

describe('canonical documents', () => {
    it('throws with the path of an undefined value (Pattern 3)', () => {
        const document = {
            infos: { relatedLore: [toObjectId(REGION_ID), undefined] },
        };

        expect(() => assertNoUndefined(document)).toThrow(
            'infos.relatedLore.1',
        );
        expect(() => assertNoUndefined({ image: undefined })).toThrow('image');
        expect(() =>
            assertNoUndefined({
                image: null,
                relatedLore: [toObjectId(REGION_ID)],
                damages: { base: [], energy: [] },
            }),
        ).not.toThrow();
    });

    it('converts a hex id into a driver ObjectId', () => {
        const id = toObjectId(REGION_ID);

        expect(id).toBeInstanceOf(ObjectId);
        expect(id.toHexString()).toBe(REGION_ID);
        expect(() => toObjectId('Borgo di Prova')).toThrow(RangeError);
    });
});
