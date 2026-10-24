import { registerEnumType } from '@nestjs/graphql';

// esito stabile di ogni risultato (D-19): il campo si chiama outcome, mai col nome vietato dal real boot (C2)
export enum QuestOutcome {
    success = 'success',
    failure = 'failure',
    rescued = 'rescued',
    death = 'death',
    gmCompleted = 'gmCompleted',
}

registerEnumType(QuestOutcome, { name: 'QuestOutcome' });
