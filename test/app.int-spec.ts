import { getQueueToken } from '@nestjs/bull';
import { INestApplication, Logger } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { IS_PUBLIC_KEY } from 'src/auth/decorators/public.decorator';
import type { AuthConfig } from 'src/config/auth-config';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { EventSubConfig } from 'src/config/eventsub-config';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import {
    OWNERSHIP_KEY,
    type OwnershipRule,
} from 'src/authz/ownership/ownership.decorators';
import { ROLES_KEY } from 'src/authz/roles/roles.decorator';
import { WalletService } from 'src/economy/wallet.service';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { PushService } from 'src/push/push.service';
import { NoopPushTransport } from 'src/push/transport/noop-push-transport';
import { PushTransport } from 'src/push/transport/push-transport';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';
import type { QuestConfig } from 'src/config/quest-config';
import { QUEST_CONFIG } from 'src/config/quest-config';
import type { SpellRecoveryConfig } from 'src/config/spell-recovery-config';
import { SPELL_RECOVERY_CONFIG } from 'src/config/spell-recovery-config';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { SpellRecoveryProcessor } from 'src/characters/spells/spell-recovery.processor';
import { SpellRecoveryService } from 'src/characters/spells/spell-recovery.service';
import { SpellRecoverySweeper } from 'src/characters/spells/spell-recovery.sweeper';
import { SpellStateMigrator } from 'src/characters/spells/spell-state.migrator';
import { CombatResolver } from 'src/quests/outcomes/combat/combat-resolver';
import { PlaceholderCombatResolver } from 'src/quests/outcomes/combat/placeholder-combat-resolver';
import { QuestResolutionService } from 'src/quests/outcomes/quest-resolution.service';
import { QuestResolutionSweeper } from 'src/quests/outcomes/quest-resolution.sweeper';
import { QuestResultMaintenance } from 'src/quests/results/quest-result-maintenance';
import { ArchivedCharacterQueueRefresher } from 'src/quests/pending-requests/archived-character-queue.refresher';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import type { TravelConfig } from 'src/config/travel-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import { TravelCompletionService } from 'src/travel/travel-completion.service';
import { TRAVEL_QUEUE } from 'src/travel/travel-job';
import { TravelSweeper } from 'src/travel/travel-sweeper';
import { startRedis, stopRedis } from './setup/redis';

const BOOT_TIMEOUT_MS = 60_000;
const VALID_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const SCHEMA_FILE = join(process.cwd(), 'src/schema.gql');
const INTRUDER_MUTATION =
    'mutation { doTransaction(request: { id: "64b000000000000000000001", boughtItems: { equipAssets: [], lootAssets: [] }, soldItems: { equipAssets: [], lootAssets: [] }, total: { gold: 0, silver: 1, copper: 0 }, isTotalPositive: true }) { successful } }';
const CREATE_CHARACTER = `mutation { createCharacter(input: { name: "Aria", sex: female, pronoun: she, race: human, classType: wizard, age: 25 }) { id } }`;
const RACE_TRAITS = '{ raceTraits { race } }';
const DELETE_CHARACTER = 'mutation { deleteCharacter { id } }';
const REGISTER_PUSH_DEVICE =
    'mutation { registerPushDevice(input: { deviceId: "d", token: "t", platform: android }) }';
const ACCEPT_QUEST =
    'mutation { acceptQuest(request: { id: "64b000000000000000000001", questId: "64b000000000000000000002" }) { successful } }';
const ABANDON_QUEST =
    'mutation { abandonQuest(request: { id: "64b000000000000000000001", questId: "64b000000000000000000002" }) { successful } }';
const START_TRAVEL =
    'mutation { startTravel(request: { id: "64b000000000000000000001", poiId: "64b000000000000000000002" }) { successful } }';
const TRAVEL_PREVIEW =
    '{ travelPreview(request: { id: "64b000000000000000000001", poiId: "64b000000000000000000002" }) { duration } }';
const QUEST_RESULT = '{ questResult(id: "64b000000000000000000001") { id } }';
const UNACKNOWLEDGED_QUEST_RESULTS = '{ unacknowledgedQuestResults { id } }';
const ACKNOWLEDGE_QUEST_RESULT =
    'mutation { acknowledgeQuestResult(id: "64b000000000000000000001") { successful } }';
const PENDING_REQUESTS = '{ pendingRequests { id } }';
const COMPLETE_PENDING_REQUEST =
    'mutation { completePendingRequest(input: { pendingQuestId: "64b000000000000000000001" }) { id } }';
const TELEPORT_CHARACTER =
    'mutation { teleportCharacter(request: { id: "64b000000000000000000001", poiId: "64b000000000000000000002" }) { successful } }';
// whitelist enumerata (D-12): ogni aggiunta di @Public() deve passare da qui
const EXPECTED_PUBLIC_HANDLERS = [
    'AppController.getHello',
    'AuthResolver.exchangeLoginTicket',
    'AuthResolver.refreshSession',
    'EventSubController.receive',
    'TwitchAuthController.callback',
    'TwitchAuthController.start',
];
// whitelist enumerate (D-15): ogni nuova operazione admin o sul personaggio deve passare da qui
const EXPECTED_INNKEEPER_HANDLERS = [
    'CharactersResolver.characters',
    'PendingQuestsResolver.pendingQuests',
    'PendingRequestsResolver.completePendingRequest',
    'PendingRequestsResolver.pendingRequests',
    'PendingRequestsResolver.pendingRequestsUpdated',
    'PushResolver.sendTestPush',
    'TravelAdminResolver.teleportCharacter',
    'UsersResolver.user',
    'UsersResolver.users',
];
const EXPECTED_OWNERSHIP_HANDLERS = [
    'CharactersResolver.character',
    'CharactersResolver.characterUpdated',
    'CharactersResolver.doTransaction',
    'CharactersResolver.equipItem',
    'CharactersResolver.equipSpell',
    'CharactersResolver.equipment',
    'CharactersResolver.unequipSpell',
    'CharactersResolver.useSpell',
    'PartyResolver.abandonQuest',
    'PendingQuestsResolver.pendingQuest',
    'QuestAcceptanceResolver.acceptQuest',
    'QuestResultsResolver.acknowledgeQuestResult',
    'QuestResultsResolver.questResult',
    'QuestResultsResolver.questResultReceived',
    'TravelResolver.startTravel',
    'TravelResolver.travelPreview',
];
// nessun bypass innkeeper (07 D-11): ogni handler owner-only deve passare da qui
const EXPECTED_OWNER_ONLY_HANDLERS = [
    'PartyResolver.abandonQuest',
    'QuestAcceptanceResolver.acceptQuest',
    'QuestResultsResolver.acknowledgeQuestResult',
    'QuestResultsResolver.questResult',
    'QuestResultsResolver.questResultReceived',
    'TravelResolver.startTravel',
    'TravelResolver.travelPreview',
];

interface PublicSurface {
    handlers: string[];
    publicClasses: string[];
}

type MetadataMatcher = (value: unknown) => boolean;

const isDefined: MetadataMatcher = (value) => value !== undefined;

function providerInstancesOf(app: INestApplication): object[] {
    const instances: object[] = [];
    for (const moduleRef of app.get(ModulesContainer).values()) {
        const wrappers = [
            ...moduleRef.controllers.values(),
            ...moduleRef.providers.values(),
        ];
        for (const wrapper of wrappers) {
            const instance: unknown = wrapper.instance;
            if (instance && typeof instance === 'object') {
                instances.push(instance);
            }
        }
    }
    return instances;
}

// legge i descriptor e non prototype[name]: alcuni provider hanno getter che lancerebbero sul prototype
function collectHandlersWithMetadata(
    app: INestApplication,
    metadataKey: string,
    matches: MetadataMatcher = isDefined,
): string[] {
    const handlers = new Set<string>();
    for (const instance of providerInstancesOf(app)) {
        const prototype = Object.getPrototypeOf(instance) as object | null;
        if (!prototype) continue;
        const type = instance.constructor;
        for (const name of Object.getOwnPropertyNames(prototype)) {
            const handler: unknown = Object.getOwnPropertyDescriptor(
                prototype,
                name,
            )?.value;
            if (
                typeof handler === 'function' &&
                matches(Reflect.getMetadata(metadataKey, handler))
            ) {
                handlers.add(`${type.name}.${name}`);
            }
        }
    }
    return [...handlers].sort();
}

function collectPublicHandlers(app: INestApplication): PublicSurface {
    const publicClasses = new Set<string>();
    for (const instance of providerInstancesOf(app)) {
        const type = instance.constructor;
        if (Reflect.getMetadata(IS_PUBLIC_KEY, type)) {
            publicClasses.add(type.name);
        }
    }
    return {
        handlers: collectHandlersWithMetadata(
            app,
            IS_PUBLIC_KEY,
            (value) => value === true,
        ),
        publicClasses: [...publicClasses],
    };
}

function graphqlCall(
    app: INestApplication,
    query: string,
    authorization?: string,
): request.Test {
    return request(app.getHttpServer())
        .post(GRAPHQL_PATH)
        .set(authorization ? { Authorization: authorization } : {})
        .send({ query });
}

function errorCodeOf(response: request.Response): unknown {
    const body = response.body as {
        errors?: { extensions: Record<string, unknown> }[];
    };
    return body.errors?.[0]?.extensions.code;
}

/**
 * INTEGRATION: boots the REAL AppModule (Bull + Redis effimero, MongoMemoryReplSet)
 * with only a fake JWT_SECRET and no Twitch credentials. process.env is set by the
 * test BEFORE AppModule is imported, so it wins over any local .env (Pitfall 8).
 */
describe('AppModule (real boot without Twitch credentials)', () => {
    const envSnapshot = { ...process.env };
    let app: INestApplication;
    let fetchSpy: jest.SpiedFunction<typeof fetch>;
    let warnSpy: jest.SpiedFunction<Logger['warn']>;

    beforeAll(async () => {
        // spie passthrough attive prima del boot: catturano le chiamate di rete e il WARN di avvio
        fetchSpy = jest.spyOn(global, 'fetch');
        warnSpy = jest.spyOn(Logger.prototype, 'warn');
        const redis = await startRedis();
        Object.assign(process.env, {
            MONGO_URI: process.env.MONGO_TEST_URI,
            DB_NAME: 'app-boot-test',
            REDIS_HOST: redis.host,
            REDIS_PORT: String(redis.port),
            JWT_SECRET: 'app-boot-test-secret-0123456789abcdef',
            TWITCH_CLIENT_ID: '',
            TWITCH_CLIENT_SECRET: '',
            TWITCH_REDIRECT_URI: '',
            APP_AUTH_REDIRECT_URL: 'klimmeck://auth',
            DEV_AUTH_ENABLED: 'false',
            // Pitfall 11: un .env locale con credenziali reali non deve mai accendere FCM nel test
            FIREBASE_SERVICE_ACCOUNT: '',
            // C2 / Pitfall 13: un .env locale con EventSub parziale non deve rompere il boot reale
            TWITCH_LOGIN_SCOPES: '',
            TWITCH_EVENTSUB_SECRET: '',
            TWITCH_EVENTSUB_CALLBACK_URL: '',
            TWITCH_BROADCASTER_ID: '',
            // Pitfall 13: nessun timer dello sweep nel boot reale; il reconciler al boot gira comunque
            TRAVEL_SWEEP_INTERVAL_MS: '0',
            QUEST_SWEEP_INTERVAL_MS: '0',
            SPELL_RECOVERY_SWEEP_INTERVAL_MS: '0',
        });
        // import differito: native import() non è disponibile in Jest CJS (module nodenext lo preserva)
        const { AppModule } =
            jest.requireActual<typeof import('src/app.module')>(
                'src/app.module',
            );
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleRef.createNestApplication({ rawBody: true });
        await app.init();
    }, BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await app?.get<Connection>(getConnectionToken()).dropDatabase();
        await app?.close();
        await stopRedis();
        fetchSpy.mockRestore();
        warnSpy.mockRestore();
        process.env = envSnapshot;
    });

    it('resolves an auth config without Twitch and without the dev bypass', () => {
        const config = app.get<AuthConfig>(AUTH_CONFIG);

        expect(config.twitch).toBeNull();
        expect(config.devAuth).toBeNull();
    });

    it('serves the root endpoint', async () => {
        await request(app.getHttpServer())
            .get('/')
            .expect(200)
            .expect('Hello World!');
    });

    it('redirects the Twitch login start to the not-configured app error', async () => {
        const response = await request(app.getHttpServer())
            .get('/auth/twitch/start')
            .query({ challenge: VALID_CHALLENGE });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
            'klimmeck://auth?error=twitch_not_configured',
        );
    });

    it('writes the session API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('type AuthSession');
        expect(schema).toContain('exchangeLoginTicket(');
        expect(schema).toContain('refreshSession(');
        expect(schema).toContain('me: User!');
        expect(schema).toContain('logout: Boolean!');
    });

    it('writes the character creation API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'createCharacter(input: CreateCharacterInput!): User!',
        );
        expect(schema).toContain('raceTraits: [RaceTraits!]!');
        expect(schema).toContain('input CreateCharacterInput');
        expect(schema).toContain('type RaceTraits');
        expect(schema).toContain('enum RaceType');
        expect(schema).toContain('enum ClassType');
        expect(schema).toContain('enum SexType');
        expect(schema).toContain('enum PronounType');
        expect(schema).toContain('race: RaceType!');
    });

    it('writes the character deletion API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('deleteCharacter: User!');
        expect(schema).not.toContain('deletedAt');
        expect(schema).not.toContain('deletionReason');
        expect(schema).not.toContain('DeletionReason');
    });

    it('keeps the real-time and authorization contract in the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('userUpdated: User!');
        expect(schema).toContain('characterUpdated(id: String!): Character!');
        expect(schema).not.toContain('createUser(');
        expect(schema).not.toContain('updateUser(');
        expect(schema).not.toContain('deleteUser(');
        expect(schema).not.toContain('input UserInput');
        expect(schema).not.toContain('AdminAuditLog');
        expect(schema).not.toContain('adminProbe');
    });

    it('writes the quest lanes into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type CharacterQuests \{[^}]*\}/)?.[0]).toBe(
            'type CharacterQuests {\n  activeStoryQuest: PendingQuest\n  activeWorldMissionQuest: PendingQuest\n  completedQuests: [Quest!]!\n  pendingQuest: PendingQuest\n}',
        );
        expect(schema.match(/type PendingQuest \{[^}]*\}/)?.[0]).toBe(
            'type PendingQuest {\n  arrivedAt: DateTime\n  id: ID!\n  pointsSpent: Int!\n  quest: Quest!\n  startDate: DateTime\n  waitingTime: Float!\n}',
        );
    });

    it('writes the quest rank slots into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type QuestRequirements \{[^}]*\}/)?.[0]).toBe(
            'type QuestRequirements {\n  minTitle: String!\n  recommendedLoot: [AssetQuantity!]!\n  requiredAdventurers: [QuestPartySlot!]!\n  requiredPoints: Int\n}',
        );
        expect(schema.match(/type QuestPartySlot \{[^}]*\}/)?.[0]).toBe(
            'type QuestPartySlot {\n  count: Int!\n  title: String\n}',
        );
        expect(schema.match(/type QuestRegistration \{[^}]*\}/)?.[0]).toBe(
            'type QuestRegistration {\n  character: ID!\n  registeredAt: DateTime\n  title: String!\n}',
        );
        expect(schema.match(/type Quest \{[^}]*\}/)?.[0]).toBe(
            'type Quest {\n  id: ID!\n  infos: QuestInfos!\n  prizes: QuestPrizes!\n  registeredAdventurers: [QuestRegistration!]!\n  requirements: QuestRequirements!\n}',
        );
        expect(schema).not.toMatch(/\bparty\b|registrations/);
    });

    it('writes the server time query into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('  serverTime: DateTime!\n');
    });

    it('writes the quest acceptance API into the generated schema', () => {
        expect(app.get(QuestAcceptanceService)).toBeInstanceOf(
            QuestAcceptanceService,
        );
        expect(app.get(WalletService)).toBeInstanceOf(WalletService);
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'acceptQuest(request: AcceptQuestRequest!): CommonResponse!',
        );
        expect(schema.match(/input AcceptQuestRequest \{[^}]*\}/)?.[0]).toBe(
            'input AcceptQuestRequest {\n  id: String!\n  questId: String!\n}',
        );
        expect(schema).toContain('serverTime: DateTime!');
        expect(schema).not.toMatch(
            /QuestAcceptance|twitchPointsDebit|INSUFFICIENT_FUNDS|registrations/,
        );
    });

    it('writes the party abandon API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'abandonQuest(request: AbandonQuestRequest!): CommonResponse!',
        );
        expect(schema.match(/input AbandonQuestRequest \{[^}]*\}/)?.[0]).toBe(
            'input AbandonQuestRequest {\n  id: String!\n  questId: String!\n}',
        );
    });

    it('writes the travel contract into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type ActiveTravel \{[^}]*\}/)?.[0]).toBe(
            'type ActiveTravel {\n  duration: Float!\n  endTime: DateTime!\n  road: TravelPath!\n  startTime: DateTime!\n  to: ID!\n}',
        );
        expect(schema.match(/type TravelPath \{[^}]*\}/)?.[0]).toBe(
            'type TravelPath {\n  coordinates: [[Float!]!]!\n  distance: Float!\n}',
        );
        expect(schema.match(/type CharacterStatus \{[^}]*\}/)?.[0]).toBe(
            'type CharacterStatus {\n  activeTravel: ActiveTravel\n  awaitingAid: AwaitingAid\n  coins: Coins!\n  currentLifePoints: Int!\n  injuries: [InjuryType!]!\n  level: Int!\n  location: PointOfInterest!\n  maxActiveSpells: Int!\n  maxLifePoints: Int!\n  spellStates: [SpellState!]!\n  spells: [Spell!]!\n  title: String!\n  xp: Int!\n}',
        );
        expect(schema.match(/type Pet \{[^}]*\}/)?.[0]).toBe(
            'type Pet {\n  buyPrice: Coins!\n  currentLifePoints: Int!\n  damages: Damages!\n  id: ID!\n  imagePath: String!\n  maxLifePoints: Int!\n  maxXp: Int!\n  name: String!\n  sellPrice: Coins!\n  speedModifier: Float\n  xp: Int!\n}',
        );
        expect(schema).not.toMatch(/TravelKind|\bkind\b/);
    });

    it('writes the spell state contract into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'type SpellState {\n  recoveries: [DateTime!]!\n  spell: Spell!\n  usages: Int!\n}',
        );
        expect(schema.match(/type ActiveSpell \{[^}]*\}/)?.[0]).toBe(
            'type ActiveSpell {\n  spell: Spell\n  usages: Int!\n}',
        );
    });

    it('writes the free travel API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'startTravel(request: TravelRequest!): CommonResponse!',
        );
        expect(schema).toContain(
            'travelPreview(request: TravelRequest!): TravelPreview!',
        );
        expect(schema.match(/input TravelRequest \{[^}]*\}/)?.[0]).toBe(
            'input TravelRequest {\n  id: String!\n  poiId: String!\n}',
        );
        expect(schema.match(/type TravelPreview \{[^}]*\}/)?.[0]).toBe(
            'type TravelPreview {\n  distance: Float!\n  duration: Float!\n  road: TravelPath!\n}',
        );
    });

    it('writes the teleport API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'teleportCharacter(request: TravelRequest!): CommonResponse!',
        );
        expect(schema).toContain(
            'input TravelRequest {\n  id: String!\n  poiId: String!\n}',
        );
        expect(schema).not.toContain('TeleportCharacterRequest');
    });

    it('writes the quest outcome fields into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type AwaitingAid \{[^}]*\}/)?.[0]).toBe(
            'type AwaitingAid {\n  aidQuest: ID!\n  quest: ID!\n  since: DateTime!\n}',
        );
        expect(schema.match(/type QuestPrizes \{[^}]*\}/)?.[0]).toBe(
            'type QuestPrizes {\n  prizeCoins: Coins\n  prizeItem: AssetQuantity\n  randomLoot: [AssetQuantity!]!\n  spell: Spell\n  xpPrize: Int\n}',
        );
        expect(schema.match(/type Quest \{[^}]*\}/)?.[0]).toBe(
            'type Quest {\n  id: ID!\n  infos: QuestInfos!\n  prizes: QuestPrizes!\n  registeredAdventurers: [QuestRegistration!]!\n  requirements: QuestRequirements!\n}',
        );
        expect(schema.match(/type QuestRegistration \{[^}]*\}/)?.[0]).toBe(
            'type QuestRegistration {\n  character: ID!\n  registeredAt: DateTime\n  title: String!\n}',
        );
        expect(schema).not.toMatch(
            /concludedAt|startedAt|archivedAt|\brescue\b|\bgrade\b/,
        );
    });

    it('writes the quest result contract into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type QuestResult \{[^}]*\}/)?.[0]).toBe(
            'type QuestResult {\n  acknowledgedAt: DateTime\n  character: ID!\n  consumablesUsed: [AssetQuantity!]!\n  enemy: Enemy\n  hpAfter: Int!\n  hpBefore: Int!\n  id: ID!\n  injuriesAdded: [InjuryType!]!\n  levelAfter: Int!\n  levelBefore: Int!\n  maxLifePoints: Int!\n  outcome: QuestOutcome!\n  quest: QuestResultQuest!\n  rescuedCharacters: [ID!]!\n  resolvedAt: DateTime!\n  rewards: QuestRewards!\n  spellLearned: Spell\n  spellsUsed: [SpellUsage!]!\n  titleAfter: String!\n  titleBefore: String!\n  user: ID!\n  xpAfter: Int!\n  xpBefore: Int!\n  xpGained: Int!\n}',
        );
        expect(schema.match(/type QuestResultQuest \{[^}]*\}/)?.[0]).toBe(
            'type QuestResultQuest {\n  id: ID!\n  title: String!\n  type: String!\n}',
        );
        expect(schema.match(/type QuestRewards \{[^}]*\}/)?.[0]).toBe(
            'type QuestRewards {\n  coins: Coins!\n  items: [AssetQuantity!]!\n}',
        );
        expect(schema.match(/type SpellUsage \{[^}]*\}/)?.[0]).toBe(
            'type SpellUsage {\n  spell: Spell\n  usages: Int!\n}',
        );
        expect(schema.match(/enum QuestOutcome \{[^}]*\}/)?.[0]).toBe(
            'enum QuestOutcome {\n  death\n  failure\n  gmCompleted\n  rescued\n  success\n}',
        );
        expect(schema).toContain('questResult(id: String!): QuestResult!');
        expect(schema).toContain(
            'questResultReceived(characterId: String!): QuestResult!',
        );
        expect(schema).toContain('questUpdated(questId: String!): Quest!');
        expect(schema).not.toMatch(/\bkind\b|\bgrade\b|CombatResolver/);
    });

    it('writes the quest result delivery API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('unacknowledgedQuestResults: [QuestResult!]!');
        expect(schema).toContain(
            'acknowledgeQuestResult(id: String!): CommonResponse!',
        );
    });

    it('writes the innkeeper queue into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type PendingRequest \{[^}]*\}/)?.[0]).toBe(
            'type PendingRequest {\n  character: PendingRequestCharacter!\n  id: ID!\n  pointsSpent: Int!\n  quest: PendingRequestQuest!\n  startDate: DateTime\n  user: PendingRequestUser!\n}',
        );
        expect(
            schema.match(/type PendingRequestCharacter \{[^}]*\}/)?.[0],
        ).toBe(
            'type PendingRequestCharacter {\n  activeTravel: ActiveTravel\n  awaitingAid: AwaitingAid\n  id: ID!\n  location: ID!\n  name: String!\n  pendingQuest: ID\n  title: String!\n}',
        );
        expect(schema.match(/type PendingRequestQuest \{[^}]*\}/)?.[0]).toBe(
            'type PendingRequestQuest {\n  id: ID!\n  registeredAdventurers: [QuestRegistration!]!\n  requiredAdventurers: [QuestPartySlot!]!\n  title: String!\n  type: String!\n}',
        );
        expect(schema.match(/type PendingRequestUser \{[^}]*\}/)?.[0]).toBe(
            'type PendingRequestUser {\n  id: ID!\n  twitchId: String!\n}',
        );
        expect(schema).toContain('  pendingRequests: [PendingRequest!]!\n');
        expect(schema).toContain(
            '  pendingRequestsUpdated: [PendingRequest!]!\n',
        );
        expect(schema).not.toMatch(/\bkind\b|\bgrade\b|TravelKind/);
    });

    it('writes the game master completion into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            '  completePendingRequest(input: CompletePendingRequestInput!): [QuestResult!]!\n',
        );
        expect(
            schema.match(/input CompletePendingRequestInput \{[^}]*\}/)?.[0],
        ).toBe(
            'input CompletePendingRequestInput {\n  outcomes: [ParticipantOverrideInput!]\n  pendingQuestId: ID!\n}',
        );
        expect(schema.match(/input ItemUsageInput \{[^}]*\}/)?.[0]).toBe(
            'input ItemUsageInput {\n  item: ID!\n  quantity: Int!\n}',
        );
        expect(
            schema.match(/input ParticipantOverrideInput \{[^}]*\}/)?.[0],
        ).toBe(
            'input ParticipantOverrideInput {\n  characterId: ID!\n  consumablesUsed: [ItemUsageInput!]\n  hpAfter: Int\n  injuries: [InjuryType!]\n  spellsUsed: [SpellUsageInput!]\n}',
        );
        expect(schema.match(/input SpellUsageInput \{[^}]*\}/)?.[0]).toBe(
            'input SpellUsageInput {\n  spell: ID!\n  usages: Int!\n}',
        );
        expect(schema).not.toMatch(
            /\bgrade\b|approvePendingRequest|rejectPendingRequest/,
        );
    });

    it('writes the push API into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'registerPushDevice(input: RegisterPushDeviceInput!): Boolean!',
        );
        expect(schema).toContain(
            'unregisterPushDevice(deviceId: String!): Boolean!',
        );
        expect(schema).toContain(
            'sendTestPush(input: SendTestPushInput!): PushDeliveryReport!',
        );
        expect(schema).toContain('input RegisterPushDeviceInput');
        expect(schema).toContain('input SendTestPushInput');
        expect(schema).toContain('enum PushPlatform');
        expect(schema).toContain('enum PushEventType');
        expect(schema).toContain('  questCancelled\n');
        expect(schema).toContain('type PushDeliveryReport');
        expect(schema).toContain('targetUserId: ID');
        expect(schema).not.toContain('type PushDevice');
        expect(schema).not.toContain('lastSeenAt');
        expect(schema).not.toContain('FIREBASE');
        expect(schema.match(/type User \{[^}]*\}/)?.[0]).not.toMatch(
            /token|deviceId|push/i,
        );
    });

    it('resolves the no-op push transport without Firebase credentials', () => {
        const transport = app.get(PushTransport);

        expect(transport).toBeInstanceOf(NoopPushTransport);
        expect(transport.enabled).toBe(false);
        expect(app.get(PushService)).toBeInstanceOf(PushService);
    });

    it('mounts the travel lifecycle', () => {
        expect(app.get(TravelSweeper)).toBeInstanceOf(TravelSweeper);
        expect(app.get(TravelCompletionService)).toBeInstanceOf(
            TravelCompletionService,
        );
        expect(app.get(getQueueToken(TRAVEL_QUEUE))).toBeDefined();
        expect(app.get<TravelConfig>(TRAVEL_CONFIG)).toEqual({
            sweepIntervalMs: 0,
        });
    });

    it('mounts the quest outcome lifecycle', () => {
        expect(app.get(QuestResolutionSweeper)).toBeInstanceOf(
            QuestResolutionSweeper,
        );
        expect(app.get(QuestResolutionService)).toBeInstanceOf(
            QuestResolutionService,
        );
        expect(app.get(getQueueToken(QUEST_RESOLUTION_QUEUE))).toBeDefined();
        expect(app.get<QuestConfig>(QUEST_CONFIG)).toEqual({
            sweepIntervalMs: 0,
        });
        expect(app.get(CombatResolver)).toBeInstanceOf(
            PlaceholderCombatResolver,
        );
    });

    it('mounts the quest result maintenance', () => {
        expect(app.get(QuestResultMaintenance)).toBeInstanceOf(
            QuestResultMaintenance,
        );
    });

    it('mounts the archived character queue refresher', () => {
        expect(app.get(ArchivedCharacterQueueRefresher)).toBeInstanceOf(
            ArchivedCharacterQueueRefresher,
        );
    });

    it('mounts the spell recovery lifecycle', () => {
        expect(app.get(SpellRecoveryProcessor)).toBeInstanceOf(
            SpellRecoveryProcessor,
        );
        expect(app.get(SpellRecoveryService)).toBeInstanceOf(
            SpellRecoveryService,
        );
        expect(app.get(SpellStateMigrator)).toBeInstanceOf(SpellStateMigrator);
        expect(app.get(SpellRecoverySweeper)).toBeInstanceOf(
            SpellRecoverySweeper,
        );
        expect(app.get(getQueueToken(SPELL_RECOVERY_QUEUE))).toBeDefined();
        expect(app.get<SpellRecoveryConfig>(SPELL_RECOVERY_CONFIG)).toEqual({
            sweepIntervalMs: 0,
        });
    });

    it('boots EventSub disabled without calling Twitch', () => {
        const twitchCalls = fetchSpy.mock.calls.filter(([url]) =>
            /twitch\.tv/.test(String(url)),
        );

        expect(app.get<EventSubConfig>(EVENTSUB_CONFIG)).toEqual({
            mode: 'disabled',
        });
        expect(twitchCalls).toHaveLength(0);
        expect(
            warnSpy.mock.calls.some(([message]) =>
                String(message).includes('EventSub disabled'),
            ),
        ).toBe(true);
    });

    it('rejects EventSub webhook calls while EventSub is disabled', async () => {
        const response = await request(app.getHttpServer())
            .post('/webhooks/twitch/eventsub')
            .set('Content-Type', 'application/json')
            .send('{}');

        expect(response.status).toBe(403);
        expect(response.text).toBe('');
    });

    it('adds no GraphQL surface for EventSub', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).not.toMatch(/eventsub|EventSub|redemption/i);
    });

    describe('global auth guard', () => {
        it('rejects an existing query without a bearer or with a forged one', async () => {
            const query = '{ users { id } }';

            expect(errorCodeOf(await graphqlCall(app, query))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
            expect(
                errorCodeOf(await graphqlCall(app, query, 'Bearer forged')),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
        });

        it('rejects an existing mutation without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, INTRUDER_MUTATION))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects createCharacter and raceTraits without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, RACE_TRAITS))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
            expect(errorCodeOf(await graphqlCall(app, CREATE_CHARACTER))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects deleteCharacter without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, DELETE_CHARACTER))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects registerPushDevice without a bearer', async () => {
            expect(
                errorCodeOf(await graphqlCall(app, REGISTER_PUSH_DEVICE)),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
        });

        it('rejects acceptQuest without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, ACCEPT_QUEST))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects abandonQuest without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, ABANDON_QUEST))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects startTravel and travelPreview without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, START_TRAVEL))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
            expect(errorCodeOf(await graphqlCall(app, TRAVEL_PREVIEW))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects teleportCharacter without a bearer', async () => {
            expect(
                errorCodeOf(await graphqlCall(app, TELEPORT_CHARACTER)),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
        });

        it('rejects questResult without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, QUEST_RESULT))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects the unconfirmed results list and the confirmation without a bearer', async () => {
            expect(
                errorCodeOf(
                    await graphqlCall(app, UNACKNOWLEDGED_QUEST_RESULTS),
                ),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
            expect(
                errorCodeOf(await graphqlCall(app, ACKNOWLEDGE_QUEST_RESULT)),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
        });

        it('rejects pendingRequests without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, PENDING_REQUESTS))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('rejects completePendingRequest without a bearer', async () => {
            expect(
                errorCodeOf(await graphqlCall(app, COMPLETE_PENDING_REQUEST)),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
        });

        it('rejects serverTime without a bearer', async () => {
            expect(errorCodeOf(await graphqlCall(app, '{ serverTime }'))).toBe(
                AuthErrorCode.UNAUTHENTICATED,
            );
        });

        it('answers 401 JSON on cloudinary/getUrls without a bearer', async () => {
            const response = await request(app.getHttpServer())
                .post('/cloudinary/getUrls')
                .send({ folder: 'x' });

            expect(response.status).toBe(401);
            expect(response.body).toMatchObject({
                statusCode: 401,
                code: AuthErrorCode.UNAUTHENTICATED,
            });
        });

        it('keeps introspection public until Phase 10 (known limit D-30)', async () => {
            const response = await graphqlCall(
                app,
                '{ __schema { queryType { name } } }',
            );
            const body = response.body as {
                data?: { __schema: { queryType: { name: string } } };
            };

            expect(body.data?.__schema.queryType.name).toBe('Query');
        });

        it('exposes exactly the enumerated @Public handlers and no public class', () => {
            const { handlers, publicClasses } = collectPublicHandlers(app);

            expect(handlers).toEqual(EXPECTED_PUBLIC_HANDLERS);
            expect(publicClasses).toEqual([]);
        });
    });

    describe('authorization surface', () => {
        it('exposes exactly the enumerated innkeeper-only handlers', () => {
            expect(collectHandlersWithMetadata(app, ROLES_KEY)).toEqual(
                EXPECTED_INNKEEPER_HANDLERS,
            );
        });

        it('exposes exactly the enumerated ownership-protected handlers', () => {
            expect(collectHandlersWithMetadata(app, OWNERSHIP_KEY)).toEqual(
                EXPECTED_OWNERSHIP_HANDLERS,
            );
        });

        it('exposes exactly the enumerated owner-only handlers', () => {
            expect(
                collectHandlersWithMetadata(
                    app,
                    OWNERSHIP_KEY,
                    (rule) =>
                        (rule as OwnershipRule | undefined)?.ownerOnly === true,
                ),
            ).toEqual(EXPECTED_OWNER_ONLY_HANDLERS);
        });
    });
});
