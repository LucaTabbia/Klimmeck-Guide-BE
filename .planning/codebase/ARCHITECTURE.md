# Architecture

**Analysis Date:** 2026-07-16

## Pattern Overview

**Overall:** NestJS modular monolith with GraphQL code-first + MongoDB event-driven subscriptions.

**Key Characteristics:**
- Modular domain-driven design (one module per entity/domain)
- GraphQL code-first with decorators on Mongoose schema classes
- MongoDB change streams → PubSub → GraphQL subscriptions for real-time updates
- Bull job queues for asynchronous background tasks (e.g., spell recovery timers)
- Graphology-based graph for pathfinding across in-game roads
- Global Mongoose plugin for ID transformation (_id → id in JSON output)

## Layers

**Model/Data Layer:**
- Purpose: Define GraphQL ObjectTypes, Mongoose Schemas, and Input types in a unified location
- Location: `src/models/`
- Contains: ObjectType decorators, @Schema decorators, SchemaFactory, Document types, InputType classes
- Depends on: @nestjs/graphql, @nestjs/mongoose, mongoose
- Used by: Services, Resolvers, Modules

**Persistence Layer:**
- Purpose: Database connectivity, schema registration, model injection
- Location: `src/mongo/mongo.module.ts`
- Contains: MongooseModule configuration, global feature registration for all schemas
- Depends on: MongooseModule.forRootAsync, ConfigService (environment-based URI and database name)
- Used by: All domain modules

**Service Layer:**
- Purpose: Business logic, query/mutation/update operations, domain-specific logic
- Location: `src/{domain}/{domain}.service.ts` (e.g., `src/characters/characters.service.ts`, `src/roads/roads.service.ts`)
- Contains: CRUD operations, complex queries, transactions, graph algorithms, PubSub publication
- Depends on: Mongoose Models, injected dependencies (PubSub, Bull Queue, other services), external libraries (graphology)
- Used by: Resolvers, other services

**Resolver/GraphQL Layer:**
- Purpose: HTTP → GraphQL translation, argument parsing, subscription setup
- Location: `src/{domain}/{domain}.resolver.ts`
- Contains: @Query, @Mutation, @Subscription decorators, error handling delegation
- Depends on: Service layer
- Used by: Apollo GraphQL server

**Module Layer:**
- Purpose: Dependency injection setup, feature isolation, module boundaries
- Location: `src/{domain}/{domain}.module.ts`
- Contains: Feature module definition, local schema registration, provider/export setup
- Depends on: MongooseModule.forFeature, feature services
- Used by: AppModule

**Job Processing Layer:**
- Purpose: Asynchronous task execution with configurable delays and retry logic
- Location: `src/{domain}/*.processor.ts` (e.g., `src/characters/spell-recovery.processor.ts`)
- Contains: Bull @Processor decorated classes with @Process methods
- Depends on: @nestjs/bull, Mongoose Models
- Used by: Services (via Queue injection)

**Pub/Sub & Subscriptions Layer:**
- Purpose: Real-time event distribution to GraphQL subscriptions
- Location: `src/pubsub.module.ts` (global), `src/{domain}/{domain}.service.ts` (publication)
- Contains: PubSub instance creation, event type definitions, MongoDB change stream listeners
- Depends on: @graphql-yoga/subscription, MongoDB change streams
- Used by: Resolvers (subscription endpoints), Services (event publishing)

## Data Flow

**Query Example (Get Character):**
1. Client sends GraphQL query `{ character(id: "123") { id name } }`
2. Apollo Server routes to `CharactersResolver.character(id)`
3. Resolver calls `CharactersService.findOne(id)`
4. Service executes Mongoose `findById()` with population chain for related entities
5. Mongoose transforms response via `idTransformPlugin` (_id → id)
6. Result serialized to GraphQL response, returned to client

**Mutation Example (Use Spell):**
1. Client sends mutation `{ useSpell(request: {...}) { response successful } }`
2. `CharactersResolver.useSpell(request)` receives typed InputType
3. Resolver calls `CharactersService.useSpell(request)`
4. Service validates character and spell state, decrements usages
5. Service enqueues recovery job to `spellRecoveryQueue` with delay = spell.recoveryTime
6. Returns `CommonResponse` with success flag
7. Bull processor executes after delay: increments usages, persists to DB

**Subscription Example (Character Updates):**
1. Client subscribes to `{ characterUpdated(id: "123") { id name } }`
2. `CharactersResolver.characterUpdated(id)` returns `this.pubSub.subscribe('characterUpdated')`
3. Client connection opens, waits for events
4. On module init: `CharactersService.onModuleInit()` establishes MongoDB change stream with filter `{ operationType: ['update', 'replace'] }`
5. When character document changes (e.g., via mutation), change stream emits event
6. Service publishes `characterUpdated` event via PubSub with full character document
7. Subscription filter checks if event's character.id matches subscription variables.id
8. Matching events sent to client via WebSocket

**Road Pathfinding Flow:**
1. Client queries `{ getPath(from: "poi1", to: "poi2") { distance time } }`
2. `RoadsResolver.getPath(from, to)` calls `RoadsService.getShortestPath(from, to)`
3. On module init: `RoadsService.onModuleInit()` calls `buildGraph()`
4. `buildGraph()` loads all Road documents, constructs undirected Graph using graphology
5. Each road's coordinates create nodes (with haversine-based weights for edges)
6. `getShortestPath()` snaps input POI coordinates to nearest graph nodes
7. Dijkstra bidirectional search finds shortest path
8. Accumulates segment lengths and time (based on road speedFactor)
9. Returns PathResponse with distance (km) and time (hours)

**State Management:**
- Character updates trigger MongoDB change streams
- Change stream publications via PubSub reach all subscribed clients
- No client-side state cache — subscriptions provide real-time sync
- Background jobs persist state changes asynchronously via Bull

## Key Abstractions

**Model (GraphQL + Mongoose Unified):**
- Purpose: Single source of truth for both API schema and DB schema
- Examples: `src/models/spell.model.ts`, `src/models/character/character.model.ts`, `src/models/road.model.ts`
- Pattern: Class decorated with @ObjectType (GraphQL) and @Schema (Mongoose), properties decorated with @Field and @Prop

**Request Input Types:**
- Purpose: Typed mutation/query arguments validated by GraphQL
- Examples: `src/models/request/use-spell-request.model.ts`, `src/models/request/equip-item-request.model.ts`
- Pattern: @InputType decorated classes, used as @Args in mutations

**Common/Shared Models:**
- Purpose: Reusable data structures (coins, equipment slots, damages, enums)
- Location: `src/models/common/`, `src/models/enums/`
- Examples: Equipment (with slot mapping), Coins (gold/silver/copper), EnergyDamage, AssetQuantity

**Service with PubSub:**
- Purpose: Business logic with built-in event publishing for subscriptions
- Key pattern in `src/characters/characters.service.ts`: service injects @Inject('PUB_SUB') PubSub, publishes on state changes
- Enables transparent subscriptions without resolver-level complexity

**Bull Processor:**
- Purpose: Decoupled background job execution (spell recovery, scheduled events)
- Pattern: @Processor('queue-name') decorator, @Process('job-type') for handler
- Advantages: Persistent queue, failure retry, delayed execution, removal on completion

**Graphology Graph:**
- Purpose: In-memory road network representation for efficient pathfinding
- Location: `src/roads/roads.service.ts`
- Pattern: Haversine distance for edge weights, Dijkstra for shortest path

## Entry Points

**Application Entry:**
- Location: `src/main.ts`
- Triggers: `npm start`, `npm start:dev`
- Responsibilities: NestFactory.create(AppModule), listen on PORT (default 3000)

**Root Module:**
- Location: `src/app.module.ts`
- Triggers: Application bootstrap
- Responsibilities: Imports all feature modules, configures GraphQL (Apollo code-first), sets up Bull Redis, applies Mongoose plugin

**GraphQL Endpoint:**
- Path: `/api/graphql`
- Type: HTTP POST (queries/mutations), WebSocket (subscriptions)
- Serves: schema.gql (auto-generated), playground (introspection enabled)

**Domain Modules:**
- Pattern: Each module bootstraps its service and resolver
- Example: `src/characters/characters.module.ts` imports Character schema, exports CharactersService
- Service is instantiated once per module, available for injection to resolvers and other services

## Error Handling

**Strategy:** NestJS exceptions with HTTP status codes mapped by exception filter.

**Patterns:**
- `NotFoundException`: Entity not found (404) — thrown in `findOne()` methods
- `BadRequestException`: Invalid request state (400) — thrown for spell state violations (already active, no usages)
- `Logger` in services: errors logged to console, change stream errors logged but not thrown (resilience)
- Change stream error handling: logged but listener continues (does not crash service)
- Job processing errors: logged, job remains in failed queue for inspection

## Cross-Cutting Concerns

**Logging:** 
- Via NestJS Logger service injected into each service
- Used for: change stream events, job processing, error conditions, graph build completion
- No centralized log aggregation configured; logs to stdout

**Validation:**
- GraphQL schema validation (types, nullability)
- Manual validation in services (entity existence, business rule checks)
- No class-validator decorators observed; validation is procedural

**Authentication:**
- No auth layer detected in current codebase
- GraphQL introspection enabled (public API)
- No JWT/API key guards on resolvers

**Data Transformation:**
- `idTransformPlugin`: Mongoose schema plugin applied globally in AppModule constructor
- Transforms all documents: _id (ObjectId) → id (string), preserves virtuals
- Applied via `mongoose.plugin(idTransformPlugin)` before any schema creation

**Database Connection:**
- Managed by MongooseModule.forRootAsync in MongoModule
- Connection string from environment variable MONGO_URI
- Database name from environment variable DB_NAME

---

*Architecture analysis: 2026-07-16*
