export const isPositiveInteger = (value: unknown): value is number =>
    Number.isSafeInteger(value) && (value as number) > 0;
