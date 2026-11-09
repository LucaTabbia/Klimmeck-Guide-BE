import {
    buildSchema,
    getVariableValues,
    Kind,
    parse,
    validate,
    type FieldNode,
    type GraphQLSchema,
    type OperationDefinitionNode,
} from 'graphql';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    EXPECTED_INNKEEPER_HANDLERS,
    EXPECTED_OWNERSHIP_HANDLERS,
    type ProtectedHandler,
} from './expected-handlers';
import {
    HANDLER_FIXTURES,
    type HandlerFixture,
    type MatrixVictims,
} from './handler-fixtures';

const SAMPLE_VICTIMS: MatrixVictims = {
    characterId: '64b000000000000000000a01',
    pendingQuestId: '64b000000000000000000a02',
    questResultId: '64b000000000000000000a03',
};

const PENDING_QUEST_TARGETS = ['PendingQuestsResolver.pendingQuest'];
const QUEST_RESULT_TARGETS = [
    'QuestResultsResolver.acknowledgeQuestResult',
    'QuestResultsResolver.questResult',
];
const SUBSCRIPTION_HANDLERS = [
    'CharactersResolver.characterUpdated',
    'PendingRequestsResolver.pendingRequestsUpdated',
    'QuestResultsResolver.questResultReceived',
];

const entries = Object.entries(HANDLER_FIXTURES) as [
    ProtectedHandler,
    HandlerFixture,
][];

function onlyOperationOf(document: string): OperationDefinitionNode {
    const operations = parse(document).definitions.filter(
        (definition): definition is OperationDefinitionNode =>
            definition.kind === Kind.OPERATION_DEFINITION,
    );
    expect(operations).toHaveLength(1);
    return operations[0];
}

function firstFieldOf(operation: OperationDefinitionNode): FieldNode {
    const [selection] = operation.selectionSet.selections;
    if (selection.kind !== Kind.FIELD) {
        throw new Error('la prima selezione non è un campo');
    }
    return selection;
}

function handlersWithTarget(target: HandlerFixture['target']): string[] {
    return entries
        .filter(([, fixture]) => fixture.target === target)
        .map(([handler]) => handler)
        .sort();
}

describe('handler fixtures of the authorization matrix', () => {
    let schema: GraphQLSchema;

    beforeAll(() => {
        schema = buildSchema(
            readFileSync(join(process.cwd(), 'src/schema.gql'), 'utf8'),
        );
    });

    it('covers every protected handler and nothing else (D-01)', () => {
        expect(Object.keys(HANDLER_FIXTURES).sort()).toEqual(
            [
                ...EXPECTED_INNKEEPER_HANDLERS,
                ...EXPECTED_OWNERSHIP_HANDLERS,
            ].sort(),
        );
    });

    it('declares the operation kind and the handler field of every document (D-01)', () => {
        for (const [handler, fixture] of entries) {
            const operation = onlyOperationOf(fixture.document);
            const handlerField = handler.split('.')[1];

            expect({
                handler,
                operation: operation.operation,
                field: firstFieldOf(operation).name.value,
                declared: fixture.field,
            }).toEqual({
                handler,
                operation: fixture.kind,
                field: handlerField,
                declared: handlerField,
            });
        }
    });

    it('validates every document against the schema (D-01)', () => {
        for (const [handler, fixture] of entries) {
            expect({
                handler,
                errors: validate(schema, parse(fixture.document)).map(
                    (error) => error.message,
                ),
            }).toEqual({ handler, errors: [] });
        }
    });

    it('coerces the minimal variables of every handler (D-01)', () => {
        for (const [handler, fixture] of entries) {
            const operation = onlyOperationOf(fixture.document);
            const coerced = getVariableValues(
                schema,
                operation.variableDefinitions ?? [],
                fixture.variables(SAMPLE_VICTIMS),
            );

            expect({
                handler,
                errors: (coerced.errors ?? []).map((error) => error.message),
            }).toEqual({ handler, errors: [] });
        }
    });

    it('targets a real victim for every ownership handler (D-01)', () => {
        const ownershipCharacterTargets = EXPECTED_OWNERSHIP_HANDLERS.filter(
            (handler) =>
                !PENDING_QUEST_TARGETS.includes(handler) &&
                !QUEST_RESULT_TARGETS.includes(handler),
        );

        expect({
            none: handlersWithTarget('none'),
            character: handlersWithTarget('character'),
            pendingQuest: handlersWithTarget('pendingQuest'),
            questResult: handlersWithTarget('questResult'),
        }).toEqual({
            none: [...EXPECTED_INNKEEPER_HANDLERS].sort(),
            character: [...ownershipCharacterTargets].sort(),
            pendingQuest: PENDING_QUEST_TARGETS,
            questResult: QUEST_RESULT_TARGETS,
        });
        expect(ownershipCharacterTargets).toHaveLength(16);
    });

    it('routes the three subscriptions through the socket (D-01)', () => {
        expect(
            entries
                .filter(([, fixture]) => fixture.kind === 'subscription')
                .map(([handler]) => handler)
                .sort(),
        ).toEqual(SUBSCRIPTION_HANDLERS);
    });
});
