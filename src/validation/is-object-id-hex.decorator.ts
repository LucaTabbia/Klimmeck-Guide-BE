import { ValidateBy } from 'class-validator';
import type { ValidationOptions } from 'class-validator';
import { isObjectIdHex } from 'src/mongo/document-id';

export const OBJECT_ID_HEX_MESSAGE = 'id non valido';

// il decoratore Mongo di class-validator accetta il maiuscolo: gli id del client sono solo l'esadecimale minuscolo a 24 (D-02, C3)
export function IsObjectIdHex(options?: ValidationOptions): PropertyDecorator {
    return ValidateBy(
        {
            name: 'isObjectIdHex',
            validator: {
                validate: (value: unknown) =>
                    typeof value === 'string' && isObjectIdHex(value),
                defaultMessage: () => OBJECT_ID_HEX_MESSAGE,
            },
        },
        options,
    );
}
