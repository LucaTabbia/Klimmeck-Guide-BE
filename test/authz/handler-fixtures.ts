// argomenti minimi validi per ogni handler protetto (Phase 17 D-01): un handler nuovo nelle liste senza
// fixture non compila (Record) e fa fallire la spec delle chiavi; i guard rifiutano prima di usare gli id,
// ma l'ownership vuole la vittima vera (Pitfall 9) e la validazione GraphQL precede i guard (Pitfall 10)
import type { ProtectedHandler } from './expected-handlers';

export const MATRIX_ANY_ID = '64b0000000000000000000ff';

export type FixtureTarget =
    | 'none'
    | 'character'
    | 'pendingQuest'
    | 'questResult';

export interface MatrixVictims {
    characterId: string;
    pendingQuestId: string;
    questResultId: string;
}

export interface HandlerFixture {
    kind: 'query' | 'mutation' | 'subscription';
    field: string;
    target: FixtureTarget;
    document: string;
    variables(victims: MatrixVictims): Record<string, unknown>;
}

const C = (v: MatrixVictims): string => v.characterId;
const ANY = MATRIX_ANY_ID;
const NO_VARIABLES = (): Record<string, unknown> => ({});

function requestMutation(
    field: string,
    inputType: string,
    variables: HandlerFixture['variables'],
): HandlerFixture {
    const operationName = field.charAt(0).toUpperCase() + field.slice(1);
    return {
        kind: 'mutation',
        field,
        target: 'character',
        document: `mutation ${operationName}($request: ${inputType}) { ${field}(request: $request) { successful } }`,
        variables,
    };
}

const EMPTY_TRANSACTION_ITEMS = { equipAssets: [], lootAssets: [] };

export const HANDLER_FIXTURES: Record<ProtectedHandler, HandlerFixture> = {
    'CharactersResolver.characters': {
        kind: 'query',
        field: 'characters',
        target: 'none',
        document: 'query Characters { characters { id } }',
        variables: NO_VARIABLES,
    },
    'GuidedMissionResolver.discardMissionDraft': {
        kind: 'mutation',
        field: 'discardMissionDraft',
        target: 'none',
        document:
            'mutation DiscardMissionDraft($pendingQuestId: ID!) { discardMissionDraft(pendingQuestId: $pendingQuestId) { successful } }',
        variables: () => ({ pendingQuestId: ANY }),
    },
    'GuidedMissionResolver.missionDraft': {
        kind: 'query',
        field: 'missionDraft',
        target: 'none',
        document:
            'query MissionDraft($pendingQuestId: ID!) { missionDraft(pendingQuestId: $pendingQuestId) { id } }',
        variables: () => ({ pendingQuestId: ANY }),
    },
    'GuidedMissionResolver.missionEnemies': {
        kind: 'query',
        field: 'missionEnemies',
        target: 'none',
        document:
            'query MissionEnemies($pendingQuestId: ID!) { missionEnemies(pendingQuestId: $pendingQuestId) { id } }',
        variables: () => ({ pendingQuestId: ANY }),
    },
    'GuidedMissionResolver.startMissionDraft': {
        kind: 'mutation',
        field: 'startMissionDraft',
        target: 'none',
        document:
            'mutation StartMissionDraft($pendingQuestId: ID!) { startMissionDraft(pendingQuestId: $pendingQuestId) { id } }',
        variables: () => ({ pendingQuestId: ANY }),
    },
    'PendingQuestsResolver.pendingQuests': {
        kind: 'query',
        field: 'pendingQuests',
        target: 'none',
        document: 'query PendingQuests { pendingQuests { id } }',
        variables: NO_VARIABLES,
    },
    'PendingRequestsResolver.completePendingRequest': {
        kind: 'mutation',
        field: 'completePendingRequest',
        target: 'none',
        document:
            'mutation CompletePendingRequest($input: CompletePendingRequestInput!) { completePendingRequest(input: $input) { id } }',
        variables: () => ({ input: { pendingQuestId: ANY } }),
    },
    'PendingRequestsResolver.pendingRequests': {
        kind: 'query',
        field: 'pendingRequests',
        target: 'none',
        document: 'query PendingRequests { pendingRequests { id } }',
        variables: NO_VARIABLES,
    },
    'PendingRequestsResolver.pendingRequestsUpdated': {
        kind: 'subscription',
        field: 'pendingRequestsUpdated',
        target: 'none',
        document:
            'subscription PendingRequestsUpdated { pendingRequestsUpdated { id } }',
        variables: NO_VARIABLES,
    },
    'PushResolver.sendTestPush': {
        kind: 'mutation',
        field: 'sendTestPush',
        target: 'none',
        document:
            'mutation SendTestPush($input: SendTestPushInput!) { sendTestPush(input: $input) { sent } }',
        variables: () => ({ input: { type: 'questEnd' } }),
    },
    'QuestGenerationResolver.generateQuests': {
        kind: 'mutation',
        field: 'generateQuests',
        target: 'none',
        document: 'mutation GenerateQuests { generateQuests { created } }',
        variables: NO_VARIABLES,
    },
    'ShopAdminResolver.shopPoolReport': {
        kind: 'query',
        field: 'shopPoolReport',
        target: 'none',
        document: 'query ShopPoolReport { shopPoolReport { cityId } }',
        variables: NO_VARIABLES,
    },
    'TravelAdminResolver.teleportCharacter': {
        kind: 'mutation',
        field: 'teleportCharacter',
        target: 'none',
        document:
            'mutation TeleportCharacter($request: TravelRequest!) { teleportCharacter(request: $request) { successful } }',
        variables: () => ({ request: { id: ANY, poiId: ANY } }),
    },
    'UsersResolver.user': {
        kind: 'query',
        field: 'user',
        target: 'none',
        document: 'query User($id: String!) { user(id: $id) { id } }',
        variables: () => ({ id: ANY }),
    },
    'UsersResolver.users': {
        kind: 'query',
        field: 'users',
        target: 'none',
        document: 'query Users { users { id } }',
        variables: NO_VARIABLES,
    },
    'CharactersResolver.character': {
        kind: 'query',
        field: 'character',
        target: 'character',
        document: 'query Character($id: String!) { character(id: $id) { id } }',
        variables: (v) => ({ id: C(v) }),
    },
    'CharactersResolver.characterUpdated': {
        kind: 'subscription',
        field: 'characterUpdated',
        target: 'character',
        document:
            'subscription CharacterUpdated($id: String!) { characterUpdated(id: $id) { id } }',
        variables: (v) => ({ id: C(v) }),
    },
    'CharactersResolver.doTransaction': requestMutation(
        'doTransaction',
        'TransactionRequest!',
        (v) => ({
            request: {
                id: C(v),
                boughtItems: EMPTY_TRANSACTION_ITEMS,
                soldItems: EMPTY_TRANSACTION_ITEMS,
                total: { gold: 0, silver: 0, copper: 0 },
                isTotalPositive: true,
            },
        }),
    ),
    'CharactersResolver.equipItem': requestMutation(
        'equipItem',
        'EquipItemRequest!',
        (v) => ({ request: { id: C(v), slotType: 'arms' } }),
    ),
    'CharactersResolver.equipPet': requestMutation(
        'equipPet',
        'EquipPetRequest!',
        (v) => ({ request: { id: C(v), petId: ANY } }),
    ),
    'CharactersResolver.equipSpell': requestMutation(
        'equipSpell',
        'EquipSpellRequest!',
        (v) => ({ request: { id: C(v), spellId: ANY } }),
    ),
    'CharactersResolver.equipment': {
        kind: 'query',
        field: 'equipment',
        target: 'character',
        document:
            'query Equipment($id: String!) { equipment(id: $id) { __typename } }',
        variables: (v) => ({ id: C(v) }),
    },
    'CharactersResolver.unequipPet': requestMutation(
        'unequipPet',
        'UnequipPetRequest!',
        (v) => ({ request: { id: C(v) } }),
    ),
    'CharactersResolver.unequipSpell': requestMutation(
        'unequipSpell',
        'EquipSpellRequest!',
        (v) => ({ request: { id: C(v), spellId: ANY } }),
    ),
    'CharactersResolver.useSpell': requestMutation(
        'useSpell',
        'UseSpellRequest!',
        (v) => ({ request: { characterId: C(v), spellId: ANY } }),
    ),
    'PartyResolver.abandonQuest': requestMutation(
        'abandonQuest',
        'AbandonQuestRequest!',
        (v) => ({ request: { id: C(v), questId: ANY } }),
    ),
    'PendingQuestsResolver.pendingQuest': {
        kind: 'query',
        field: 'pendingQuest',
        target: 'pendingQuest',
        document:
            'query PendingQuest($id: String!) { pendingQuest(id: $id) { id } }',
        variables: (v) => ({ id: v.pendingQuestId }),
    },
    'QuestAcceptanceResolver.acceptQuest': requestMutation(
        'acceptQuest',
        'AcceptQuestRequest!',
        (v) => ({ request: { id: C(v), questId: ANY } }),
    ),
    'QuestAcceptanceResolver.questTravelPreview': {
        kind: 'query',
        field: 'questTravelPreview',
        target: 'character',
        document:
            'query QuestTravelPreview($request: AcceptQuestRequest!) { questTravelPreview(request: $request) { duration } }',
        variables: (v) => ({ request: { id: C(v), questId: ANY } }),
    },
    'QuestResultsResolver.acknowledgeQuestResult': {
        kind: 'mutation',
        field: 'acknowledgeQuestResult',
        target: 'questResult',
        document:
            'mutation AcknowledgeQuestResult($id: String!) { acknowledgeQuestResult(id: $id) { successful } }',
        variables: (v) => ({ id: v.questResultId }),
    },
    'QuestResultsResolver.questResult': {
        kind: 'query',
        field: 'questResult',
        target: 'questResult',
        document:
            'query QuestResult($id: String!) { questResult(id: $id) { id } }',
        variables: (v) => ({ id: v.questResultId }),
    },
    'QuestResultsResolver.questResultReceived': {
        kind: 'subscription',
        field: 'questResultReceived',
        target: 'character',
        document:
            'subscription QuestResultReceived($characterId: String!) { questResultReceived(characterId: $characterId) { id } }',
        variables: (v) => ({ characterId: C(v) }),
    },
    'TravelResolver.startTravel': requestMutation(
        'startTravel',
        'TravelRequest!',
        (v) => ({ request: { id: C(v), poiId: ANY } }),
    ),
    'TravelResolver.travelPreview': {
        kind: 'query',
        field: 'travelPreview',
        target: 'character',
        document:
            'query TravelPreview($request: TravelRequest!) { travelPreview(request: $request) { duration } }',
        variables: (v) => ({ request: { id: C(v), poiId: ANY } }),
    },
};
