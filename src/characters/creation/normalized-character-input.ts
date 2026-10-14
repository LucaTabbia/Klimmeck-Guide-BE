import { ClassType } from 'src/models/enums/class-type.enum';
import { PronounType } from 'src/models/enums/pronoun-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';
import { SexType } from 'src/models/enums/sex-type.enum';

export interface NormalizedCharacterInput {
    name: string;
    sex: SexType;
    pronoun: PronounType;
    race: RaceType;
    classType: ClassType;
    age: number;
    background: string;
    imagePath: string | null;
}
