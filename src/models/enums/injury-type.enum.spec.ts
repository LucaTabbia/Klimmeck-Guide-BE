import { readFileSync } from 'fs';
import { join } from 'path';
import { InjuryType } from './injury-type.enum';

const SCHEMA_FILE = join(process.cwd(), 'src/schema.gql');

const NEW_INJURIES = [
    'contusion',
    'punctureWound',
    'muscleTear',
    'exhaustion',
    'sprain',
    'dislocatedShoulder',
    'brokenNose',
    'hypothermia',
    'stunned',
];

function injuryTypeSdlValues(): string[] {
    const schema = readFileSync(SCHEMA_FILE, 'utf8');
    const block = schema.match(/^enum InjuryType \{\n([\s\S]*?)\n\}/m);
    return block ? block[1].split('\n').map((line) => line.trim()) : [];
}

// sortSchema ordina i valori per code unit (graphql naturalCompare), come Array.sort
function sortedLikeSchema(values: readonly string[]): string[] {
    return [...values].sort();
}

describe('InjuryType', () => {
    it('pins the 37 injuries, the nine of quick 261109-inj2 after spinalInjury', () => {
        expect(Object.values(InjuryType)).toEqual([
            'headConcussion',
            'traumaticBrainInjury',
            'missingLeftEye',
            'missingRightEye',
            'blindness',
            'blackEye',
            'missingLeftArm',
            'missingRightArm',
            'brokenLeftArm',
            'brokenRightArm',
            'crushedLeftHand',
            'crushedRightHand',
            'missingRightHand',
            'missingLeftHand',
            'missingLeftLeg',
            'missingRightLeg',
            'brokenLeftLeg',
            'brokenRightLeg',
            'fracturedRib',
            'puncturedLung',
            'deepCut',
            'severeBurn',
            'poisonInjection',
            'paralysis',
            'internalBleeding',
            'frostbite',
            'infection',
            'spinalInjury',
            ...NEW_INJURIES,
        ]);
    });

    it('exposes the nine new injuries in the InjuryType SDL enum', () => {
        expect(injuryTypeSdlValues()).toEqual(
            expect.arrayContaining(NEW_INJURIES),
        );
    });

    it('keeps the InjuryType SDL enum as sortSchema prints it, so the boot does not rewrite it', () => {
        expect(injuryTypeSdlValues()).toEqual(
            sortedLikeSchema(Object.values(InjuryType)),
        );
    });
});
