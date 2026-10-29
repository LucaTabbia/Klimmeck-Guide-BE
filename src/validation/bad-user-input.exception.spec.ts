import { BadUserInputException } from 'src/validation/bad-user-input.exception';

describe('BadUserInputException', () => {
    it('codes every validation failure as BAD_USER_INPUT with field names only (D-03)', () => {
        const exception = new BadUserInputException(['id', 'items.0.quantity']);

        expect(exception.extensions).toEqual({ code: 'BAD_USER_INPUT' });
        expect(exception.getStatus()).toBe(400);
        expect(exception.getResponse()).toEqual({
            statusCode: 400,
            error: 'Bad Request',
            code: 'BAD_USER_INPUT',
            message: 'Input non valido: id, items.0.quantity',
        });
    });

    it('exposes the invalid fields and builds the same exception from the factory (D-03)', () => {
        const exception = BadUserInputException.of(['id']);

        expect(exception).toBeInstanceOf(BadUserInputException);
        expect(exception.fields).toEqual(['id']);
        expect(exception.message).toBe('Input non valido: id');
    });
});
