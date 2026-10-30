import { validate } from 'class-validator';
import {
    IsObjectIdHex,
    OBJECT_ID_HEX_MESSAGE,
} from 'src/validation/is-object-id-hex.decorator';

class IdHolder {
    @IsObjectIdHex()
    id: unknown;
}

class IdListHolder {
    @IsObjectIdHex({ each: true })
    ids: unknown;
}

function holderOf(id: unknown): IdHolder {
    return Object.assign(new IdHolder(), { id });
}

describe('IsObjectIdHex', () => {
    it.each([
        ['64b000000000000000000001', true],
        ['64B000000000000000000001', false],
        ['abc', false],
        ['123456789012', false],
        [42, false],
        [null, false],
    ])(
        'accepts only lowercase 24-char hex ids: %p → %p (D-02, C3)',
        async (id, valid) => {
            const errors = await validate(holderOf(id));

            expect(errors.length === 0).toBe(valid);
        },
    );

    it('uses a constant constraint message that never echoes the value (D-03)', async () => {
        const errors = await validate(holderOf('fake-bad-id'));

        expect(errors.map((error) => error.constraints)).toEqual([
            { isObjectIdHex: OBJECT_ID_HEX_MESSAGE },
        ]);
        expect(OBJECT_ID_HEX_MESSAGE).toBe('id non valido');
    });

    it('validates every entry of a list with each (D-02)', async () => {
        const valid = Object.assign(new IdListHolder(), {
            ids: ['64b000000000000000000001', '64b000000000000000000002'],
        });
        const invalid = Object.assign(new IdListHolder(), {
            ids: ['64b000000000000000000001', 'zz'],
        });

        expect(await validate(valid)).toEqual([]);
        expect(
            (await validate(invalid)).map((error) => error.property),
        ).toEqual(['ids']);
    });
});
