// valori letti lean da path non tipizzati: solo le stringhe, una stringa sola vale una lista di un elemento
export const stringsOf = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }
    return typeof value === 'string' ? [value] : [];
};
