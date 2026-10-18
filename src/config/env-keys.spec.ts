import { readEnvKeys } from 'src/config/env-keys';

describe('readEnvKeys', () => {
    it('stringifies scalars and drops non-scalars and unlisted keys', () => {
        const source = {
            A: 'x',
            B: 3000,
            C: true,
            D: { nested: 1 },
            E: undefined,
            F: null,
            G: 'ignored',
        };

        expect(
            readEnvKeys(source, ['A', 'B', 'C', 'D', 'E', 'F'] as const),
        ).toEqual({ A: 'x', B: '3000', C: 'true' });
    });
});
