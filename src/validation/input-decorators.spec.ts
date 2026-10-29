import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { getMetadataStorage, ValidationTypes } from 'class-validator';
import { AssetQuantityInput } from 'src/models/common/asset-quantity.model';
import { CoinsInput } from 'src/models/common/coins.model';
import { AbandonQuestRequest } from 'src/models/request/abandon-quest-request.model';
import { AcceptQuestRequest } from 'src/models/request/accept-quest-request.model';
import {
    CompletePendingRequestInput,
    ItemUsageInput,
    ParticipantOverrideInput,
    SpellUsageInput,
} from 'src/models/request/complete-pending-request.model';
import { CreateCharacterInput } from 'src/models/request/create-character-request.model';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';
import { EquipSpellRequest } from 'src/models/request/equip-spell-request.model';
import { TransactionItems } from 'src/models/request/transaction-items.model';
import { TransactionRequest } from 'src/models/request/transaction-request.model';
import { TravelRequest } from 'src/models/request/travel-request.model';
import { UseSpellRequest } from 'src/models/request/use-spell-request.model';
import { RegisterPushDeviceInput } from 'src/push/dto/register-push-device.input';
import { SendTestPushInput } from 'src/push/dto/send-test-push.input';

type InputClass = new () => object;

const VALIDATED_INPUTS: Record<string, InputClass> = {
    AbandonQuestRequest,
    AcceptQuestRequest,
    AssetQuantityInput,
    CoinsInput,
    CompletePendingRequestInput,
    CreateCharacterInput,
    EquipItemRequest,
    EquipSpellRequest,
    ItemUsageInput,
    ParticipantOverrideInput,
    RegisterPushDeviceInput,
    SendTestPushInput,
    SpellUsageInput,
    TransactionItems,
    TransactionRequest,
    TravelRequest,
    UseSpellRequest,
};

// deprecato: la whitelist lo scarta prima del service (D-01)
const STRIPPED_FIELDS = ['EquipSpellRequest.usages'];

const INPUT_NAMES = Object.keys(VALIDATED_INPUTS);

interface SchemaField {
    name: string;
    type: string;
}

function readSchemaInputs(): Map<string, SchemaField[]> {
    const sdl = readFileSync(join(process.cwd(), 'src/schema.gql'), 'utf8');
    const inputs = new Map<string, SchemaField[]>();
    for (const block of sdl.matchAll(/^input (\w+) \{\n([\s\S]*?)^\}/gm)) {
        const fields = [...block[2].matchAll(/^ {2}(\w+): (.+)$/gm)].map(
            ([, name, type]) => ({ name, type }),
        );
        inputs.set(block[1], fields);
    }
    return inputs;
}

const SCHEMA_INPUTS = readSchemaInputs();

const schemaFieldsOf = (input: string): SchemaField[] =>
    SCHEMA_INPUTS.get(input) ?? [];

const namedTypeOf = (type: string): string => type.replace(/[[\]!]/g, '');

const isListType = (type: string): boolean => type.startsWith('[');

const validationMetadatasOf = (input: string) =>
    getMetadataStorage().getTargetValidationMetadatas(
        VALIDATED_INPUTS[input],
        '',
        true,
        false,
    );

const nestedFieldsOf = (input: string): SchemaField[] =>
    schemaFieldsOf(input).filter((field) =>
        INPUT_NAMES.includes(namedTypeOf(field.type)),
    );

describe('input decorators', () => {
    it('covers exactly the inputs of the generated schema (D-01)', () => {
        expect([...SCHEMA_INPUTS.keys()].sort()).toEqual(
            Object.keys(VALIDATED_INPUTS).sort(),
        );
    });

    it.each(INPUT_NAMES)(
        'validates every schema field of %s (D-01)',
        (input) => {
            const expected = schemaFieldsOf(input)
                .map((field) => field.name)
                .filter((name) => !STRIPPED_FIELDS.includes(`${input}.${name}`))
                .sort();
            const decorated = [
                ...new Set(
                    validationMetadatasOf(input).map(
                        (metadata) => metadata.propertyName,
                    ),
                ),
            ].sort();

            expect(decorated).toEqual(expected);
        },
    );

    it.each(INPUT_NAMES)(
        'declares @Type on every nested input of %s (D-01)',
        (input) => {
            for (const field of nestedFieldsOf(input)) {
                const nestedClass = VALIDATED_INPUTS[namedTypeOf(field.type)];
                const validatesNested = validationMetadatasOf(input).some(
                    (metadata) =>
                        metadata.propertyName === field.name &&
                        metadata.type === ValidationTypes.NESTED_VALIDATION,
                );
                const plain = isListType(field.type) ? [{}] : {};
                const instance = plainToInstance(VALIDATED_INPUTS[input], {
                    [field.name]: plain,
                }) as Record<string, unknown>;
                const nested = isListType(field.type)
                    ? (instance[field.name] as unknown[])[0]
                    : instance[field.name];

                expect({ field: field.name, validatesNested }).toEqual({
                    field: field.name,
                    validatesNested: true,
                });
                expect(nested).toBeInstanceOf(nestedClass);
            }
        },
    );
});
