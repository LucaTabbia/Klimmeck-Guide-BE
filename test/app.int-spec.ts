import { getQueueToken } from '@nestjs/bull';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { Application } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { IS_PUBLIC_KEY } from 'src/auth/decorators/public.decorator';
import { SessionRevocationService } from 'src/auth/session/session-revocation.service';
import { UserRoleChangesPublisher } from 'src/auth/session/user-role-changes.publisher';
import { WsSessionRegistry } from 'src/auth/ws/ws-session-registry';
import type { AuthConfig } from 'src/config/auth-config';
import { AUTH_CONFIG } from 'src/config/auth-config';
import type { EventSubConfig } from 'src/config/eventsub-config';
import type { RuntimeConfig } from 'src/config/runtime-config';
import { RUNTIME_CONFIG } from 'src/config/runtime-config';
import { RuntimeModeReporter } from 'src/config/runtime-mode.reporter';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import {
    OWNERSHIP_KEY,
    type OwnershipRule,
} from 'src/authz/ownership/ownership.decorators';
import { ROLES_KEY } from 'src/authz/roles/roles.decorator';
import { WalletService } from 'src/economy/wallet.service';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';
import { UnhandledExceptionFilter } from 'src/http/unhandled-exception.filter';
import { DisabledImageModerator } from 'src/moderation/disabled-image.moderator';
import { ImageModerator } from 'src/moderation/image-moderator';
import { ModerationStartupReporter } from 'src/moderation/moderation-startup.reporter';
import { PushService } from 'src/push/push.service';
import { NoopPushTransport } from 'src/push/transport/noop-push-transport';
import { PushTransport } from 'src/push/transport/push-transport';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';
import type { QuestConfig } from 'src/config/quest-config';
import { QUEST_CONFIG } from 'src/config/quest-config';
import type { SpellRecoveryConfig } from 'src/config/spell-recovery-config';
import { SPELL_RECOVERY_CONFIG } from 'src/config/spell-recovery-config';
import type { ThrottleConfig } from 'src/config/throttle-config';
import { THROTTLE_CONFIG } from 'src/config/throttle-config';
import { AppThrottlerGuard } from 'src/throttling/app-throttler.guard';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { SpellRecoveryProcessor } from 'src/characters/spells/spell-recovery.processor';
import { SpellRecoveryService } from 'src/characters/spells/spell-recovery.service';
import { SpellRecoverySweeper } from 'src/characters/spells/spell-recovery.sweeper';
import { SpellStateMigrator } from 'src/characters/spells/spell-state.migrator';
import { CombatResolver } from 'src/quests/outcomes/combat/combat-resolver';
import { PlaceholderCombatResolver } from 'src/quests/outcomes/combat/placeholder-combat-resolver';
import { QuestResolutionService } from 'src/quests/outcomes/quest-resolution.service';
import { QuestResolutionSweeper } from 'src/quests/outcomes/quest-resolution.sweeper';
import { PrisonReleaseSweeper } from 'src/characters/imprisonment/prison-release.sweeper';
import { QuestResultMaintenance } from 'src/quests/results/quest-result-maintenance';
import { CharacterUpdatesPublisher } from 'src/characters/character-updates.publisher';
import { PendingQuestStartPublisher } from 'src/characters/pending-quest-start.publisher';
import { SweepIndexVerifier } from 'src/mongo/sweep-index.verifier';
import { MixedRefsVerifier } from 'src/migrations/mixed-refs/mixed-refs.verifier';
import { ArchivedCharacterQueueRefresher } from 'src/quests/pending-requests/archived-character-queue.refresher';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import type { TravelConfig } from 'src/config/travel-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import { TravelCompletionService } from 'src/travel/travel-completion.service';
import { TRAVEL_QUEUE } from 'src/travel/travel-job';
import { TravelSweeper } from 'src/travel/travel-sweeper';
import {
    EXPECTED_INNKEEPER_HANDLERS,
    EXPECTED_OWNER_ONLY_HANDLERS,
    EXPECTED_OWNERSHIP_HANDLERS,
} from './authz/expected-handlers';
import {
    bootRealApp,
    REAL_BOOT_TIMEOUT_MS,
    type RealAppBoot,
} from './harness/real-app-boot';

const VALID_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const SCHEMA_FILE = join(process.cwd(), 'src/schema.gql');
// l'unico kind sul filo è quello dei risultati (Phase 15 D-14): il kind interno del viaggio resta fuori
const ONLY_RESULT_KIND = ['  kind: QuestResultKind!'];
const CATALOGUE_PET_BLOCK =
    'type Pet {\n  attack: Damages!\n  buyPrice: Coins!\n  defense: Damages!\n  id: ID!\n  imagePath: String!\n  maxLifePoints: Int!\n  maxXp: Int!\n  name: String!\n  rarity: RarityType\n  relatedLore: [Lore!]!\n  sellPrice: Coins!\n  sellable: Boolean\n  speedModifier: Float\n}';
const RARITY_TYPE_BLOCK =
    'enum RarityType {\n  common\n  legendary\n  rare\n  ultrarare\n  uncommon\n}';
const OWNED_PET_BLOCK =
    'type OwnedPet {\n  currentLifePoints: Int!\n  pet: Pet!\n  xp: Int!\n}';
const CHARACTER_STATUS_BLOCK =
    'type CharacterStatus {\n  activeTravel: ActiveTravel\n  awaitingAid: AwaitingAid\n  coins: Coins!\n  currentLifePoints: Int!\n  guidedMissionInProgress: Boolean!\n  imprisonedUntil: DateTime\n  injuries: [InjuryType!]!\n  level: Int!\n  location: PointOfInterest!\n  maxActiveSpells: Int!\n  maxLifePoints: Int!\n  missionInProgress: Boolean!\n  potionRecoveryUntil: DateTime\n  spellStates: [SpellState!]!\n  title: String!\n  unlockedLore: [ID!]!\n  xp: Int!\n}';
const CHARACTER_ASSETS_BLOCK =
    'type CharacterAssets {\n  ownedEquipments: [AssetQuantity!]!\n  ownedItems: [AssetQuantity!]!\n  ownedPets: [OwnedPet!]!\n  pet: Pet\n  wornEquipment: Equipment!\n}';
const EQUIPMENT_BLOCK =
    'type Equipment {\n  arms: EquipmentItem\n  chest: EquipmentItem\n  feet: EquipmentItem\n  firstAccessory: EquipmentItem\n  head: EquipmentItem\n  leftHand: EquipmentItem\n  legs: EquipmentItem\n  rightHand: EquipmentItem\n  secondAccessory: EquipmentItem\n}';
const SLOT_TYPE_BLOCK =
    'enum SlotType {\n  arms\n  chest\n  feet\n  firstAccessory\n  head\n  leftHand\n  legs\n  rightHand\n  secondAccessory\n}';
// SDL della bozza guidata (RESEARCH §Q9 + D-17): blocchi verbatim
const MISSION_DRAFT_BLOCKS: Record<string, string> = {
    'type MissionDraft':
        'type MissionDraft {\n  fights: [MissionFight!]!\n  id: ID!\n  participants: [MissionParticipant!]!\n  place: ID\n  prizes: [MissionPrize!]!\n  quest: ID!\n  questType: String!\n  startedAt: DateTime!\n  step: MissionDraftStep!\n  updatedAt: DateTime!\n}',
    'enum MissionDraftStep':
        'enum MissionDraftStep {\n  fights\n  prizes\n  recap\n  teleport\n}',
    'type MissionFight':
        'type MissionFight {\n  enemies: [MissionFightEnemy!]!\n  outcomes: [MissionFightOutcome!]!\n  verdict: MissionFightVerdict\n}',
    'type MissionFightEffects':
        'type MissionFightEffects {\n  consumablesUsed: [MissionItemUsage!]!\n  hpAfter: Int!\n  injuriesAdded: [InjuryType!]!\n  spellsUsed: [MissionSpellUsage!]!\n}',
    'type MissionFightEnemy':
        'type MissionFightEnemy {\n  enemy: Enemy!\n  quantity: Int!\n}',
    'type MissionFightOutcome':
        'type MissionFightOutcome {\n  character: ID!\n  consumablesAvailable: [MissionItemUsage!]!\n  corrected: MissionFightEffects\n  hpBefore: Int!\n  injuriesBefore: [InjuryType!]!\n  simulated: MissionFightEffects\n  spellsAvailable: [MissionSpellUsage!]!\n}',
    'enum MissionFightVerdict':
        'enum MissionFightVerdict {\n  failure\n  success\n}',
    'type MissionItemUsage':
        'type MissionItemUsage {\n  item: ID!\n  quantity: Int!\n}',
    'type MissionParticipant':
        'type MissionParticipant {\n  character: ID!\n  maxLifePoints: Int!\n  name: String!\n  pendingQuest: ID!\n  title: String!\n}',
    'type MissionPrize':
        'type MissionPrize {\n  character: ID!\n  coins: Coins!\n  cure: QuestCure\n  items: [MissionPrizeItem!]!\n  pet: ID\n  spell: ID\n  xp: Int!\n}',
    'type MissionPrizeItem':
        'type MissionPrizeItem {\n  item: ID!\n  quantity: Int!\n}',
    'type MissionSpellUsage':
        'type MissionSpellUsage {\n  spell: ID!\n  usages: Int!\n}',
};
const MISSION_DRAFT_OPERATIONS = [
    '  discardMissionDraft(pendingQuestId: ID!): CommonResponse!\n',
    '  startMissionDraft(pendingQuestId: ID!): MissionDraft!\n',
    '  missionDraft(pendingQuestId: ID!): MissionDraft\n',
];
const kindLinesOf = (schema: string): string[] =>
    schema.match(/^.*\bkind\b.*$/gm) ?? [];
const INTRUDER_MUTATION =
    'mutation { doTransaction(request: { id: "64b000000000000000000001", boughtItems: { equipAssets: [], lootAssets: [] }, soldItems: { equipAssets: [], lootAssets: [] }, total: { gold: 0, silver: 1, copper: 0 }, isTotalPositive: true }) { successful } }';
const CREATE_CHARACTER = `mutation { createCharacter(input: { name: "Aria", sex: female, pronoun: she, race: human, classType: wizard, age: 25 }) { id } }`;
const RACE_TRAITS = '{ raceTraits { race } }';
const DELETE_CHARACTER = 'mutation { deleteCharacter { id } }';
const USE_ITEM =
    'mutation { useItem(itemId: "64b000000000000000000001") { hpAfter } }';
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
const QUEST_TRAVEL_PREVIEW =
    '{ questTravelPreview(request: { id: "64b000000000000000000001", questId: "64b000000000000000000002" }) { hpLost } }';
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
// throttling minimo (D-08): ogni handler limitato deve passare da qui, mai una mutation di gioco
const EXPECTED_THROTTLED_HANDLERS = [
    'AuthResolver.exchangeLoginTicket',
    'AuthResolver.refreshSession',
    'CloudinaryController.getSubfoldersUrls',
    'CloudinaryController.getUrls',
    'CloudinaryController.uploadImage',
    'EventSubController.receive',
    'TwitchAuthController.callback',
    'TwitchAuthController.start',
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
 * with only a fake JWT_SECRET and no Twitch credentials. bootRealApp sets process.env
 * BEFORE AppModule is imported, so it wins over any local .env (Pitfall 8).
 */
describe('AppModule (real boot without Twitch credentials)', () => {
    let boot: RealAppBoot | undefined;
    let app: INestApplication;
    let fetchSpy: jest.SpiedFunction<typeof fetch>;
    let warnSpy: jest.SpiedFunction<Logger['warn']>;
    beforeAll(async () => {
        // spie passthrough attive prima del boot: catturano le chiamate di rete e il WARN di avvio
        fetchSpy = jest.spyOn(global, 'fetch');
        warnSpy = jest.spyOn(Logger.prototype, 'warn');
        boot = await bootRealApp({ dbName: 'app-boot-test' });
        app = boot.app;
    }, REAL_BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await boot?.close();
        jest.restoreAllMocks();
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

    it('tags every HTTP response with a request id (D-07)', async () => {
        const generated = await request(app.getHttpServer()).get('/');
        const echoed = await request(app.getHttpServer())
            .get('/')
            .set('x-request-id', 'boot-1');

        expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
        expect(echoed.headers['x-request-id']).toBe('boot-1');
    });

    it('sends no CORS headers (D-06)', async () => {
        const response = await request(app.getHttpServer())
            .options(GRAPHQL_PATH)
            .set('Origin', 'https://evil.example')
            .set('Access-Control-Request-Method', 'POST');

        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('mounts the REST error filter', () => {
        expect(
            providerInstancesOf(app).some(
                (instance) => instance instanceof UnhandledExceptionFilter,
            ),
        ).toBe(true);
    });

    it('mounts the request id middleware without the legacy route path warning', () => {
        const legacyWarnings = warnSpy.mock.calls.filter(([message]) =>
            /Unsupported route path/.test(String(message)),
        );

        expect(legacyWarnings).toEqual([]);
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

    it('writes the lore with its image path and without the global unlocked flag (11 D-25, D-11)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type Lore \{[^}]*\}/)?.[0]).toBe(
            'type Lore {\n  description: String!\n  id: ID!\n  imagePath: String\n  name: String!\n  relatedLore: [Lore!]!\n  type: String!\n}',
        );
    });

    it('writes the enemy weaknesses in place of the two lists (D-01)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type Enemy \{[^}]*\}/)?.[0]).toBe(
            'type Enemy {\n  damages: Damages!\n  id: ID!\n  imagePath: String!\n  legendary: Boolean!\n  lifePoints: Int!\n  locations: [PoiType!]!\n  name: String!\n  relatedLore: [Lore!]!\n  spells: [Spell!]!\n  weaknesses: Weaknesses!\n  xp: Int!\n}',
        );
        expect(schema.match(/type Weaknesses \{[^}]*\}/)?.[0]).toBe(
            'type Weaknesses {\n  base: [DamageType!]!\n  energy: [EnergyType!]!\n}',
        );
        expect(schema).toContain('enum DamageType {');
        expect(schema).toContain('enum EnergyType {');
        expect(schema).not.toContain('input WeaknessesInput');
        expect(schema).not.toContain('input EnemyInput');
    });

    it('writes the catalogue pet with attack and defense and without state (D-03, D-15)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type Pet \{[^}]*\}/)?.[0]).toBe(
            CATALOGUE_PET_BLOCK,
        );
        expect(schema).not.toContain('input PetInput');
    });

    it('writes the nullable pet rarity into the generated schema (D-27)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type Pet \{[^}]*\}/)?.[0]).toBe(
            CATALOGUE_PET_BLOCK,
        );
        expect(schema.match(/enum RarityType \{[^}]*\}/)?.[0]).toBe(
            RARITY_TYPE_BLOCK,
        );
        expect(schema).not.toContain('input PetInput');
    });

    it('writes the owned pets as entries with their own state (D-03)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type OwnedPet \{[^}]*\}/)?.[0]).toBe(
            OWNED_PET_BLOCK,
        );
        expect(schema.match(/type CharacterAssets \{[^}]*\}/)?.[0]).toBe(
            CHARACTER_ASSETS_BLOCK,
        );
    });

    it('writes the worn equipment and the feet slot into the generated schema (D-06)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type CharacterAssets \{[^}]*\}/)?.[0]).toBe(
            CHARACTER_ASSETS_BLOCK,
        );
        expect(schema.match(/type Equipment \{[^}]*\}/)?.[0]).toBe(
            EQUIPMENT_BLOCK,
        );
        expect(schema.match(/enum SlotType \{[^}]*\}/)?.[0]).toBe(
            SLOT_TYPE_BLOCK,
        );
    });

    it('writes the quest enemies list in place of the single enemy (D-01)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type QuestInfos \{[^}]*\}/)?.[0]).toBe(
            'type QuestInfos {\n  description: String\n  enemies: [QuestEnemy!]!\n  markerLocation: PointOfInterest!\n  relatedLore: [Lore!]!\n  timeToComplete: Int\n  title: String!\n  type: String!\n}',
        );
        expect(schema).toContain(
            'type QuestEnemy {\n  enemy: Enemy!\n  known: Boolean!\n  quantity: Int!\n}',
        );
        expect(schema).not.toContain('input QuestInfosInput');
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
            'type Quest {\n  awaitingRescue: Boolean!\n  id: ID!\n  infos: QuestInfos!\n  noEffect: Boolean!\n  prizes: QuestPrizes!\n  rankPrizes: [QuestRankPrizes!]!\n  registeredAdventurers: [QuestRegistration!]!\n  requirements: QuestRequirements!\n}',
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
            CHARACTER_STATUS_BLOCK,
        );
        expect(schema.match(/type Pet \{[^}]*\}/)?.[0]).toBe(
            CATALOGUE_PET_BLOCK,
        );
        expect(schema).not.toMatch(/TravelKind/);
        expect(kindLinesOf(schema)).toEqual(ONLY_RESULT_KIND);
    });

    it('writes the single spell state list and drops the two old spell lists (D-07)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type SpellState \{[^}]*\}/)?.[0]).toBe(
            'type SpellState {\n  active: Boolean!\n  recoveries: [DateTime!]!\n  spell: Spell!\n  usages: Int!\n}',
        );
        expect(schema.match(/type CharacterStatus \{[^}]*\}/)?.[0]).toBe(
            CHARACTER_STATUS_BLOCK,
        );
        expect(schema.match(/type CharacterAssets \{[^}]*\}/)?.[0]).toBe(
            CHARACTER_ASSETS_BLOCK,
        );
        expect(schema).not.toMatch(/type ActiveSpell \{/);
    });

    it('writes the city size and the shop flag into the generated schema without the pool lists (D-01, D-18)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type City \{[^}]*\}/)?.[0]).toBe(
            'type City {\n  area: [[Float!]!]!\n  hasShop: Boolean!\n  id: ID!\n  markerLocation: PointOfInterest!\n  name: String!\n  pointsOfInterest: [PointOfInterest!]\n  relatedLore: Lore\n  size: CitySize!\n  type: CityType!\n}',
        );
        expect(schema).toContain(
            'enum CitySize {\n  capital\n  city\n  village\n}',
        );
    });

    it('writes the point of interest without the quest back link (D-09)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type PointOfInterest \{[^}]*\}/)?.[0]).toBe(
            'type PointOfInterest {\n  city: City\n  id: ID!\n  location: [Float!]!\n  type: [PoiType!]!\n}',
        );
    });

    it('deprecates the global catalogue queries for cityShop (D-20)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]! @deprecated(reason: "Phase 12: use cityShop")',
        );
        expect(schema).toContain(
            'lootAssetsQuantity: [AssetQuantity!]! @deprecated(reason: "Phase 12: use cityShop")',
        );
    });

    it('writes the city shop contract of the FE Phase 13 into the generated schema (D-13, D-15, D-17, D-18)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        for (const contract of [
            'cityShop(cityId: ID!): CityShop!',
            'type CityShop {\n  city: City!\n  equipment: [AssetQuantity!]!\n  loot: [AssetQuantity!]!\n  pets: [Pet!]!\n}',
            'enum CitySize {\n  capital\n  city\n  village\n}',
            'hasShop: Boolean!',
            'size: CitySize!',
            'ownedPets: [OwnedPet!]!',
            'petAssets: [AssetQuantityInput!]\n',
            'equipPet(request: EquipPetRequest!): CommonResponse!',
            'unequipPet(request: UnequipPetRequest!): CommonResponse!',
            'input EquipPetRequest {\n  id: String!\n  petId: String!\n}',
            'input UnequipPetRequest {\n  id: String!\n}',
            'shopPoolReport: [ShopPoolReportEntry!]!',
        ])
            expect(schema).toContain(contract);
        for (const type of ['Pet', 'EquipmentItem', 'LootItem'])
            expect(
                schema.match(new RegExp(`type ${type} \\{[^}]*\\}`))?.[0],
            ).toContain('  sellable: Boolean\n');
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
            'type TravelPreview {\n  arrivesAlive: Boolean!\n  distance: Float!\n  duration: Float!\n  food: [TravelFoodItem!]!\n  hpLost: Int!\n  road: TravelPath!\n}',
        );
    });

    it('writes the food of the travel preview into the generated schema (D-09, D-14)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type TravelFoodItem \{[^}]*\}/)?.[0]).toBe(
            'type TravelFoodItem {\n  item: LootItem!\n  quantity: Int!\n}',
        );
        expect(schema).toContain(
            'travelPreview(request: TravelRequest!): TravelPreview!',
        );
    });

    it('writes the quest travel preview query as nullable into the generated schema (D-08, D-14)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'questTravelPreview(request: AcceptQuestRequest!): TravelPreview\n',
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
            'type QuestPrizes {\n  cure: QuestCure\n  pet: Pet\n  prizeCoins: Coins\n  prizeItem: AssetQuantity\n  randomLoot: [AssetQuantity!]!\n  spell: Spell\n  xpPrize: Int\n}',
        );
        expect(schema.match(/type Quest \{[^}]*\}/)?.[0]).toBe(
            'type Quest {\n  awaitingRescue: Boolean!\n  id: ID!\n  infos: QuestInfos!\n  noEffect: Boolean!\n  prizes: QuestPrizes!\n  rankPrizes: [QuestRankPrizes!]!\n  registeredAdventurers: [QuestRegistration!]!\n  requirements: QuestRequirements!\n}',
        );
        expect(schema.match(/type QuestRegistration \{[^}]*\}/)?.[0]).toBe(
            'type QuestRegistration {\n  character: ID!\n  registeredAt: DateTime\n  title: String!\n}',
        );
        expect(schema).not.toMatch(
            /concludedAt|startedAt|archivedAt|\brescue\b|\bgrade\b/,
        );
    });

    it('writes the quest cure contract of the FE Phase 18 into the generated schema (D-01, D-24)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type QuestCure \{[^}]*\}/)?.[0]).toBe(
            'type QuestCure {\n  canHeal: [InjuryType!]!\n  lifePointsShare: Float!\n}',
        );
        expect(schema).not.toMatch(/QuestCureInput|QuestPrizesInput/);
    });

    it('writes the potion contract of the FE Phase 18 into the generated schema (D-15, D-19, D-24)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type LootRecovery \{[^}]*\}/)?.[0]).toBe(
            'type LootRecovery {\n  time: Int!\n  turns: Int!\n}',
        );
        expect(schema.match(/type LootItem \{[^}]*\}/)?.[0]).toContain(
            '  recovery: LootRecovery\n  relatedLore: [Lore!]!\n',
        );
        expect(schema).not.toMatch(/LootRecoveryInput|LootItemInput/);
    });

    it('writes the useItem contract of the FE Phase 18 into the generated schema (D-17, D-21)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('  useItem(itemId: ID!): UseItemResult!\n');
        expect(schema.match(/type UseItemResult \{[^}]*\}/)?.[0]).toBe(
            'type UseItemResult {\n  hpAfter: Int!\n  hpBefore: Int!\n  injuriesHealed: [InjuryType!]!\n  loreUnlocked: [Lore!]!\n  quantityLeft: Int!\n  recoveryUntil: DateTime!\n}',
        );
    });

    it('writes the no-effect heal flag of the FE Phase 18 into the generated schema (D-25)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type Quest \{[^}]*\}/)?.[0]).toContain(
            '  noEffect: Boolean!\n',
        );
        expect(schema).not.toMatch(/QUEST_NO_EFFECT/);
    });

    it('adds the rescue lock of the source quest to the schema (quick 261113-aql)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type Quest \{[^}]*\}/)?.[0]).toContain(
            '\n  awaitingRescue: Boolean!\n',
        );
    });

    it('adds the rank prize blocks to the schema (D-22)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type QuestRankPrizes \{[^}]*\}/)?.[0]).toBe(
            'type QuestRankPrizes {\n  prizes: QuestPrizes!\n  title: String!\n}',
        );
    });

    it('adds the dungeon turns to the schema (D-21, D-22)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/enum DungeonTurnKind \{[^}]*\}/)?.[0]).toBe(
            'enum DungeonTurnKind {\n  exploration\n  fight\n}',
        );
    });

    it('writes the quest result contract into the generated schema', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema.match(/type QuestResult \{[^}]*\}/)?.[0]).toBe(
            'type QuestResult {\n  acknowledgedAt: DateTime\n  ambush: AmbushReport\n  arrested: Boolean!\n  character: ID!\n  coinsLost: Coins\n  consumablesUsed: [AssetQuantity!]!\n  enemies: [QuestEnemy!]!\n  guardEncounter: Boolean!\n  hpAfter: Int!\n  hpBefore: Int!\n  id: ID!\n  injuriesAdded: [InjuryType!]!\n  injuriesHealed: [InjuryType!]!\n  kind: QuestResultKind!\n  lastTurn: Int\n  lastTurnKind: DungeonTurnKind\n  levelAfter: Int!\n  levelBefore: Int!\n  loreUnlocked: [Lore!]!\n  maxLifePoints: Int!\n  outcome: QuestOutcome!\n  petXpGained: Int!\n  quest: QuestResultQuest\n  rescuedCharacters: [ID!]!\n  resolvedAt: DateTime!\n  rewards: QuestRewards!\n  spellLearned: Spell\n  spellsUsed: [SpellUsage!]!\n  stagesCleared: Int\n  stagesTotal: Int\n  titleAfter: String!\n  titleBefore: String!\n  turnsCompleted: Int\n  turnsTotal: Int\n  user: ID!\n  xpAfter: Int!\n  xpBefore: Int!\n  xpGained: Int!\n}',
        );
        expect(schema.match(/type QuestResultQuest \{[^}]*\}/)?.[0]).toBe(
            'type QuestResultQuest {\n  id: ID!\n  title: String!\n  type: String!\n}',
        );
        expect(schema.match(/type AmbushCity \{[^}]*\}/)?.[0]).toBe(
            'type AmbushCity {\n  id: ID!\n  name: String!\n}',
        );
        expect(schema.match(/type AmbushReport \{[^}]*\}/)?.[0]).toBe(
            'type AmbushReport {\n  at: DateTime!\n  nearCity: AmbushCity!\n  reachedCity: AmbushCity\n}',
        );
        expect(schema.match(/enum QuestResultKind \{[^}]*\}/)?.[0]).toBe(
            'enum QuestResultKind {\n  ambush\n  quest\n}',
        );
        expect(schema.match(/type QuestRewards \{[^}]*\}/)?.[0]).toBe(
            'type QuestRewards {\n  coins: Coins!\n  items: [AssetQuantity!]!\n  pet: Pet\n}',
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
        expect(schema).not.toMatch(/\bgrade\b|CombatResolver/);
        expect(kindLinesOf(schema)).toEqual(ONLY_RESULT_KIND);
    });

    it('writes the additive quest generation fields into the generated schema (D-04, D-24)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain(
            'enum AccessoryUseType {\n  attack\n  defense\n}',
        );
        expect(schema.match(/type Enemy \{[^}]*\}/)?.[0]).toContain(
            '  imagePath: String!\n  legendary: Boolean!\n  lifePoints: Int!\n',
        );
        expect(
            schema
                .match(/type EquipmentItem \{[^}]*\}/)?.[0]
                .startsWith(
                    'type EquipmentItem {\n  accessoryUseTypes: [AccessoryUseType!]\n  addedSpell: Spell\n',
                ),
        ).toBe(true);
    });

    it('writes the generateQuests mutation into the generated schema (D-16)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        expect(schema).toContain('generateQuests: GenerateQuestsResult!');
        expect(schema.match(/type GenerateQuestsResult \{[^}]*\}/)?.[0]).toBe(
            'type GenerateQuestsResult {\n  created: Int!\n}',
        );
    });

    it('writes the quest generation contract of the FE Phase 14 into the generated schema (D-01, D-16, D-21, D-24)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');
        const block = (name: string): string | undefined =>
            schema.match(new RegExp(`type ${name} \\{[^}]*\\}`))?.[0];

        expect(schema).toContain(
            'type QuestEnemy {\n  enemy: Enemy!\n  known: Boolean!\n  quantity: Int!\n}',
        );
        expect(block('QuestInfos')).toContain('  enemies: [QuestEnemy!]!\n');
        expect(block('QuestInfos')).toContain('  description: String\n');
        expect(block('QuestResult')).toContain('  enemies: [QuestEnemy!]!\n');
        expect(block('QuestResult')).toContain(
            '  stagesCleared: Int\n  stagesTotal: Int\n',
        );
        expect(block('QuestPrizes')).toContain('  pet: Pet\n');
        expect(block('QuestRewards')).toContain('  pet: Pet\n');
        expect(block('Enemy')).toContain('  legendary: Boolean!\n');
        expect(schema).toContain(
            'enum AccessoryUseType {\n  attack\n  defense\n}',
        );
        expect(block('EquipmentItem')).toContain(
            '  accessoryUseTypes: [AccessoryUseType!]\n',
        );
        expect(schema).toContain('generateQuests: GenerateQuestsResult!');
        expect(schema).toContain(
            'type GenerateQuestsResult {\n  created: Int!\n}',
        );
        expect(schema).not.toMatch(
            /DungeonResolver| {2}generated: Boolean|legendaryEnemy/,
        );
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
        expect(schema).not.toMatch(/\bgrade\b|TravelKind/);
        expect(kindLinesOf(schema)).toEqual(ONLY_RESULT_KIND);
    });

    it('keeps the guided draft marker off the pending quest type (D-18)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');
        const pendingQuestType = schema.match(
            /type PendingQuest \{[^}]*\}/,
        )?.[0];

        expect(pendingQuestType).toBeDefined();
        expect(pendingQuestType).not.toContain('missionDraftStartedAt');
    });

    it('adds the guided mission draft to the schema (D-17)', () => {
        const schema = readFileSync(SCHEMA_FILE, 'utf8');

        for (const [head, block] of Object.entries(MISSION_DRAFT_BLOCKS)) {
            const pattern = new RegExp(`${head} \\{[^}]*\\}`);
            expect(schema.match(pattern)?.[0]).toBe(block);
        }
        for (const operation of MISSION_DRAFT_OPERATIONS) {
            expect(schema).toContain(operation);
        }
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
        expect(schema).toContain('  ambushDefeat\n');
        // liberazione dalla prigione (quick 261110-prp): valore additivo dell'enum
        expect(schema).toContain('  prisonRelease\n');
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
        // liberazione dalla prigione (quick 261110-prp): stesso intervallo dello sweep delle missioni
        expect(app.get(PrisonReleaseSweeper)).toBeInstanceOf(
            PrisonReleaseSweeper,
        );
        expect(app.get(getQueueToken(QUEST_RESOLUTION_QUEUE))).toBeDefined();
        expect(app.get<QuestConfig>(QUEST_CONFIG)).toEqual({
            sweepIntervalMs: 0,
        });
        expect(app.get(CombatResolver)).toBeInstanceOf(
            PlaceholderCombatResolver,
        );
    });

    it('boots without the one-off lore backfill of the Phase 16 (16 D-11)', () => {
        const moduleNames = [...app.get(ModulesContainer).values()].map(
            (moduleRef) => moduleRef.metatype.name,
        );

        expect(moduleNames).not.toContain('LoreBackfillModule');
    });

    it('does not mount the one-off model review migration (D-12)', () => {
        const moduleNames = [...app.get(ModulesContainer).values()].map(
            (moduleRef) => moduleRef.metatype.name,
        );

        expect(moduleNames).not.toContain('ModelReviewMigrationModule');
    });

    it('mounts the quest result maintenance', () => {
        expect(app.get(QuestResultMaintenance)).toBeInstanceOf(
            QuestResultMaintenance,
        );
    });

    it('mounts the character updates publisher', () => {
        expect(app.get(CharacterUpdatesPublisher)).toBeInstanceOf(
            CharacterUpdatesPublisher,
        );
    });

    it('mounts the pending quest start publisher', () => {
        expect(app.get(PendingQuestStartPublisher)).toBeInstanceOf(
            PendingQuestStartPublisher,
        );
    });

    it('mounts the sweep index verifier', () => {
        expect(app.get(SweepIndexVerifier)).toBeInstanceOf(SweepIndexVerifier);
    });

    it('mounts the Mixed references verifier', () => {
        expect(app.get(MixedRefsVerifier)).toBeInstanceOf(MixedRefsVerifier);
    });

    it('mounts the archived character queue refresher', () => {
        expect(app.get(ArchivedCharacterQueueRefresher)).toBeInstanceOf(
            ArchivedCharacterQueueRefresher,
        );
    });

    it('mounts the user role changes publisher', () => {
        expect(app.get(UserRoleChangesPublisher)).toBeInstanceOf(
            UserRoleChangesPublisher,
        );
    });

    it('mounts the session revocation', () => {
        expect(app.get(SessionRevocationService)).toBeInstanceOf(
            SessionRevocationService,
        );
        expect(app.get(WsSessionRegistry)).toBeInstanceOf(WsSessionRegistry);
    });

    it('mounts the runtime mode reporter', () => {
        expect(app.get(RuntimeModeReporter)).toBeInstanceOf(
            RuntimeModeReporter,
        );
        expect(app.get<RuntimeConfig>(RUNTIME_CONFIG)).toEqual({
            mode: 'test',
            production: false,
            modeDefaulted: false,
        });
    });

    it('mounts the image moderation disabled without Sightengine keys (D-14)', () => {
        expect(app.get(ImageModerator)).toBeInstanceOf(DisabledImageModerator);
        expect(app.get(ModerationStartupReporter)).toBeInstanceOf(
            ModerationStartupReporter,
        );
        expect(
            warnSpy.mock.calls.some(([message]) =>
                String(message).startsWith(
                    'Moderazione delle immagini disattivata',
                ),
            ),
        ).toBe(true);
    });

    it('mounts the global validation pipe', () => {
        expect(
            providerInstancesOf(app).some(
                (instance) => instance instanceof ValidationPipe,
            ),
        ).toBe(true);
    });

    it('mounts the throttler with the phase defaults', () => {
        expect(app.get<ThrottleConfig>(THROTTLE_CONFIG)).toEqual({
            ttlMs: 60000,
            limit: 20,
            webhookLimit: 1000,
            trustProxy: null,
        });
    });

    it('leaves the proxy trust off by default (C19)', () => {
        const server: Application = app.getHttpAdapter().getInstance();

        expect(server.get('trust proxy')).toBeFalsy();
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

        it('rejects useItem without a bearer (D-21)', async () => {
            expect(errorCodeOf(await graphqlCall(app, USE_ITEM))).toBe(
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

        it('rejects questTravelPreview without a bearer (D-08)', async () => {
            expect(
                errorCodeOf(await graphqlCall(app, QUEST_TRAVEL_PREVIEW)),
            ).toBe(AuthErrorCode.UNAUTHENTICATED);
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

        it('keeps introspection available outside production (D-05)', async () => {
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

    describe('throttled surface', () => {
        it('exposes exactly the enumerated throttled handlers (D-08)', () => {
            expect(
                collectHandlersWithMetadata(
                    app,
                    GUARDS_METADATA,
                    (guards) =>
                        Array.isArray(guards) &&
                        guards.includes(AppThrottlerGuard),
                ),
            ).toEqual(EXPECTED_THROTTLED_HANDLERS);
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
