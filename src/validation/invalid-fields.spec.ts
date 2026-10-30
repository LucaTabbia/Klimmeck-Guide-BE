import { ValidationError } from 'class-validator';
import { invalidFieldsOf } from 'src/validation/invalid-fields';

function validationError(
    property: string,
    options: {
        constraints?: Record<string, string>;
        children?: ValidationError[];
        value?: unknown;
    } = {},
): ValidationError {
    return Object.assign(new ValidationError(), {
        property,
        constraints: options.constraints,
        children: options.children ?? [],
        value: options.value,
    });
}

describe('invalidFieldsOf', () => {
    it('reports the parent path of a constraint on the parent itself (D-03)', () => {
        const errors = [
            validationError('items', {
                constraints: { arrayMaxSize: 'too many' },
                children: [
                    validationError('0', {
                        children: [
                            validationError('quantity', {
                                constraints: { min: 'too small' },
                            }),
                        ],
                    }),
                ],
            }),
        ];

        expect(invalidFieldsOf(errors)).toEqual(['items', 'items.0.quantity']);
    });

    it('reports nested paths with array indexes (D-03)', () => {
        const errors = [
            validationError('items', {
                children: [
                    validationError('1', {
                        children: [
                            validationError('item', {
                                constraints: { isObjectIdHex: 'id non valido' },
                            }),
                        ],
                    }),
                ],
            }),
        ];

        expect(invalidFieldsOf(errors)).toEqual(['items.1.item']);
    });

    it('never reports a value (D-03)', () => {
        const errors = [
            validationError('id', {
                constraints: { isObjectIdHex: 'id non valido' },
                value: 'fake-secret-value',
            }),
            validationError('note', {
                constraints: { maxLength: 'too long' },
                value: 'fake-long-note',
            }),
        ];

        expect(invalidFieldsOf(errors)).toEqual(['id', 'note']);
    });
});
