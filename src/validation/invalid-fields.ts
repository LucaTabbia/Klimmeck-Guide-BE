import type { ValidationError } from 'class-validator';

// il vincolo del padre (es. la lunghezza di un array) conta quanto quelli dei figli; value e messaggi dei vincoli restano fuori (D-03)
export function invalidFieldsOf(
    errors: readonly ValidationError[],
    parent = '',
): string[] {
    return errors.flatMap((error) => {
        const path = parent ? `${parent}.${error.property}` : error.property;
        const own = error.constraints ? [path] : [];
        return [...own, ...invalidFieldsOf(error.children ?? [], path)];
    });
}
