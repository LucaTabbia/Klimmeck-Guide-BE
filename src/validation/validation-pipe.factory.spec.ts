import { Type } from 'class-transformer';
import { IsInt, Min, ValidateNested } from 'class-validator';
import { BadUserInputException } from 'src/validation/bad-user-input.exception';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';
import { createValidationPipe } from 'src/validation/validation-pipe.factory';

const VALID_ID = '64b000000000000000000001';

class ProbeItemDto {
    @IsInt()
    @Min(0)
    quantity!: number;
}

// target esnext: ogni campo dichiarato (anche opzionale) diventa una chiave propria dell'istanza
class StripProbeDto {
    @IsObjectIdHex()
    id!: string;
}

class ProbeDto {
    @IsObjectIdHex()
    id!: string;

    @ValidateNested({ each: true })
    @Type(() => ProbeItemDto)
    items?: ProbeItemDto[];
}

describe('createValidationPipe', () => {
    it('strips undeclared properties and transforms plain inputs (D-01)', async () => {
        const result: unknown = await createValidationPipe().transform(
            { id: VALID_ID, extra: 1 },
            { type: 'body', metatype: StripProbeDto },
        );

        expect(result).toBeInstanceOf(StripProbeDto);
        expect(Object.keys(result as object).sort()).toEqual(['id']);
    });

    it('rejects with BAD_USER_INPUT listing each field once (D-03)', async () => {
        const rejection: unknown = await createValidationPipe()
            .transform(
                {
                    id: 'zz',
                    items: [{ quantity: -1.5 }, { quantity: 1 }],
                },
                { type: 'body', metatype: ProbeDto },
            )
            .catch((error: unknown) => error);

        expect(rejection).toBeInstanceOf(BadUserInputException);
        expect((rejection as BadUserInputException).fields).toEqual([
            'id',
            'items.0.quantity',
        ]);
        expect((rejection as BadUserInputException).message).toBe(
            'Input non valido: id, items.0.quantity',
        );
    });
});
