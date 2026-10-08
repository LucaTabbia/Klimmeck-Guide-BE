<!-- GSD:project-start source:PROJECT.md -->
## Project

**Klimmeck Guide — Backend**

Backend **NestJS 11 + MongoDB (Mongoose 8) + GraphQL (Apollo code-first, HTTP + WS)** dell'app mobile Klimmeck Guide: un RPG persistente alimentato dai punti canale Twitch di un singolo canale. Il backend è la **fonte di verità** di tutto il gioco — progressione, combattimento, HP, slot magie, economia, viaggi — mentre il frontend Flutter è puramente reattivo. Lo streamer (role `innkeeper`) è il game master.

**Core Value:** Il backend è la fonte di verità affidabile e sicura dello stato di gioco: nessun client può alterare uno stato che non gli appartiene, e ogni valore mostrato dal frontend è calcolato e garantito server-side.

### Constraints

- **Tech stack**: NestJS 11 + Mongoose 8 + Apollo GraphQL code-first + Bull/ioredis — già in uso, non negoziabile
- **API Twitch**: rate limit e disponibilità sono un constraint dichiarato — da qui la scelta JWT di sessione (una validazione Twitch al login, non per-request)
- **Compatibilità FE**: i contratti GraphQL esistenti consumati dal FE non si rompono; le aggiunte di schema devono arrivare su staging prima delle fasi FE che le consumano
- **Single channel**: un solo canale Twitch, lo streamer è l'unico `innkeeper`
- **TDD**: Red → Green → Refactor obbligatorio per ogni feature/bugfix
- **Workflow**: branch + PR verso `develop` per ogni fase; mai push diretto su `develop`/`main`; Conventional Commits
- **Security**: nessun secret in repo (`.env` fuori VCS, creare `.env.example`); backend fonte di verità
- **Principi**: Clean Code, SoC, Boy Scout Rule
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7.3 - All source code, configuration, and tests
- JavaScript (ESNext) - Compiled via NestJS build toolchain
## Runtime
- Node.js (latest LTS compatible via ESNext compilation)
- Yarn 1.22.22+sha512...
- Lockfile: `package-lock.json` (npm format, managed via Yarn)
## Frameworks
- NestJS 11.0.1 - Application framework, dependency injection, CLI tooling
- Express 5.0.0 (via @nestjs/platform-express) - HTTP server provider
- @nestjs/graphql 13.2.0 - NestJS GraphQL integration
- Apollo 13.1.0 (@nestjs/apollo) - GraphQL server driver
- graphql 16.11.0 - Core GraphQL implementation
- graphql-subscriptions 3.0.0 - PubSub mechanism for real-time updates
- @graphql-yoga/subscription 5.0.5 - GraphQL Yoga subscription support
- graphql-ws (configured in app.module.ts:55) - WebSocket protocol for subscriptions
- Mongoose 8.18.1 - MongoDB object document mapper (ODM)
- @nestjs/mongoose 11.0.3 - NestJS Mongoose integration
- MongoDB 6.19.0 - Native MongoDB driver (used by Mongoose)
- Bull 4.16.5 - Job queue library
- @nestjs/bull 11.0.3 - NestJS Bull integration
- ioredis 5.7.0 - Redis client for Bull queue storage
- multer - Express file upload middleware
- @nestjs/platform-express - Multer integration for NestJS
- multer-storage-cloudinary 4.0.0 - Cloudinary storage adapter for Multer
- Cloudinary 1.41.3 - Cloud image/media management SDK
- graphology 0.26.0 - Graph data structure library
- graphology-shortest-path 2.1.0 - Dijkstra shortest path implementation
## Testing
- Jest 30.0.0 - Test runner and assertion library
- ts-jest 29.2.5 - TypeScript support for Jest
- @nestjs/testing 11.0.1 - NestJS test utilities
- supertest 7.0.0 - HTTP assertion library for integration tests
- @types/jest 30.0.0
- @types/node 22.10.7
- @types/express 5.0.0
- @types/multer 2.0.0
- @types/bull 3.15.9
- @types/supertest 6.0.2
## Build & Development Tools
- @nestjs/cli 11.0.0 - NestJS command-line tools
- @nestjs/schematics 11.0.0 - Code generators for NestJS
- ts-loader 9.5.2 - TypeScript webpack loader
- ts-node 10.9.2 - TypeScript execution for Node.js
- ESLint 9.18.0 - Linting
- Prettier 3.4.2 - Code formatting
- tsconfig-paths 4.2.0 - Path alias resolution
- source-map-support 0.5.21 - Production stack trace mapping
- reflect-metadata 0.2.2 - Decorator metadata support (required by NestJS)
- rxjs 7.8.1 - Reactive streams (used by NestJS internally)
- dotenv 17.2.2 - Environment variable loading (manually used in ConfigModule)
- @nestjs/config 4.0.2 - NestJS config management
## Configuration
- Configuration via `ConfigModule.forRoot()` in `src/app.module.ts:31-34`
- Environment file: `.env` (present but not read here per security policy)
- Loaded globally for all modules
- `PORT` - Server port (default: 3000, see `src/main.ts:6`)
- `MONGO_URI` - MongoDB connection string (loaded in `src/mongo/mongo.module.ts:28`)
- `DB_NAME` - MongoDB database name (loaded in `src/mongo/mongo.module.ts:29`)
- `REDIS_HOST` - Redis host for Bull queue (default: 'localhost', see `src/app.module.ts:39`)
- `REDIS_PORT` - Redis port for Bull queue (default: 6379, see `src/app.module.ts:40`)
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud identifier (see `src/rest/cloudinary/cloudinary.service.ts:8`)
- `CLOUDINARY_API_KEY` - Cloudinary API key (see `src/rest/cloudinary/cloudinary.service.ts:9`)
- `CLOUDINARY_API_SECRET` - Cloudinary API secret (see `src/rest/cloudinary/cloudinary.service.ts:10`)
- `tsconfig.json` - TypeScript compiler configuration with NestJS decorators enabled
- `nest-cli.json` - NestJS CLI configuration with source root at `src/`
- `tsconfig.build.json` - Build-specific TypeScript configuration
- `package.json` Jest configuration (lines 73-89)
- `.prettierrc` - Prettier config: single quotes, trailing commas
- ESLint configured via ESLint v9 flat config (ESLint 9.18.0, @eslint/js 9.18.0)
## Platform Requirements
- Node.js (LTS or current)
- Yarn 1.22.22+
- Redis server (for Bull queue)
- MongoDB server (local or remote)
- Cloudinary account (for image storage)
- Node.js LTS (production-grade runtime)
- Redis instance (separate from development)
- MongoDB instance (separate from development, production-grade)
- Cloudinary account credentials
- Environment variables configured securely
- `yarn build` - Compile TypeScript to dist/
- `yarn start` - Run compiled server from dist/main.js
- `yarn start:dev` - Run with watch mode and hot reload
- `yarn start:debug` - Run with Node debugger on port 9229
- `yarn start:prod` - Production startup via `node dist/main`
- `yarn test` - Run Jest test suite
- `yarn test:watch` - Jest watch mode
- `yarn test:cov` - Jest with coverage report
- `yarn test:e2e` - End-to-end tests (config: `test/jest-e2e.json`)
- `yarn lint` - Fix linting issues with ESLint
- `yarn format` - Format code with Prettier
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Services: `{feature}.service.ts` (e.g., `characters.service.ts`)
- Resolvers: `{feature}.resolver.ts` (e.g., `characters.resolver.ts`)
- Modules: `{feature}.module.ts` (e.g., `characters.module.ts`)
- Models: `{entity}.model.ts` (e.g., `character.model.ts`, `spell.model.ts`)
- Request/Response DTOs: `{name}-request.model.ts`, `{name}-response.model.ts`
- Enums: `{entity}-type.enum.ts` or `{entity}_type.enum.ts` (inconsistent: both kebab and snake_case used)
- Processors: `{feature}.processor.ts` (e.g., `spell-recovery.processor.ts`)
- Verb-based: `findAll()`, `findOne()`, `doTransaction()`, `equipItem()`, `handleSpellRecovery()`
- camelCase consistently used
- Private helper methods prefixed when needed: `private roundCoord()`, `private toRad()`
- camelCase: `characterId`, `spellId`, `activeSpell`, `wearedEquipment`
- Constants in UPPER_SNAKE_CASE: `MAX_SNAP_DISTANCE_KM`, `R` (radius constant)
- Database model properties use camelCase: `ownedEquipments`, `activeSpells`, `wearedEquipment`
- PascalCase: `Character`, `Spell`, `Equipment`, `CommonResponse`
- Enum names PascalCase: `SlotType`, `ClassType`
- Enum values lowercase with camelCase properties: 
- @Injectable() for services and processors
- @Resolver() for GraphQL resolvers with entity: `@Resolver(() => Character)`
- @Module() for feature modules
- @Processor() for Bull job processors: `@Processor('spell-recovery')`
- @Field() for GraphQL schema fields
- @ObjectType() for output types
- @InputType() for input types
## Code Style
- Tool: Prettier 3.4.2
- Single quotes: ✓ enforced (`.prettierrc`: `"singleQuote": true`)
- Trailing commas: `all` (after all array/object elements)
- Indentation: 4 spaces (inferred from code style)
- Line length: No explicit limit detected
- Tool: ESLint 9.18.0 with TypeScript 8.20.0
- Config: `eslint.config.mjs` (flat config format)
- Rules relaxed for flexibility:
- Integrates: prettier for formatting rules
## Import Organization
- Uses absolute paths with `src/` prefix: `import { Character } from 'src/models/character/character.model'`
- No path aliases configured in `tsconfig.json` beyond base URL
## Error Handling
- `NotFoundException`: When entity not found
- `BadRequestException`: For invalid requests or state violations
- Exceptions are caught by NestJS GraphQL error handler automatically
- Always include descriptive message with IDs involved
- English in code conditions
- User-facing messages in Italian (mixed in return responses)
## Logging
- `this.logger.log()` - General information, operation success
- `this.logger.warn()` - Non-critical issues, fallback behavior
- `this.logger.error()` - Exceptions and critical failures
- Log messages often in Italian for context: "Errore nel change stream MongoDB"
- Condition descriptions in English: "not found", "skipping recovery"
## Comments
- Minimal comments observed; code should be self-documenting
- Italian inline comments explaining complex logic:
- No JSDoc/TSDoc annotations observed
## Function Design
- Prefer Request/Response DTOs over multiple parameters
- GraphQL decorators handle argument extraction
- GraphQL operations: return typed objects (`Character`, `CommonResponse`, etc.)
- Services return domain models or responses
- Async/Promise used for all I/O operations
- Null handling: Check before processing, throw exception if required entity missing
## GraphQL Response Pattern
## Module Design
- Modules export main Service for cross-module use
- Resolvers are providers, not exported (used internally)
- Constructor injection standard
- @Inject() for non-class providers (PubSub, queues)
- @InjectModel() for Mongoose models
- @InjectQueue() for Bull queues
## TypeScript Configuration
- `strictNullChecks: true` - Null/undefined safety enforced
- `noImplicitAny: false` - Any type allowed for flexibility
- `emitDecoratorMetadata: true` - Required for NestJS decorators
- `experimentalDecorators: true` - Decorator support enabled
- `target: esnext` - Modern JavaScript output
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Modular domain-driven design (one module per entity/domain)
- GraphQL code-first with decorators on Mongoose schema classes
- MongoDB change streams → PubSub → GraphQL subscriptions for real-time updates
- Bull job queues for asynchronous background tasks (e.g., spell recovery timers)
- Graphology-based graph for pathfinding across in-game roads
- Global Mongoose plugin for ID transformation (_id → id in JSON output)
## Layers
- Purpose: Define GraphQL ObjectTypes, Mongoose Schemas, and Input types in a unified location
- Location: `src/models/`
- Contains: ObjectType decorators, @Schema decorators, SchemaFactory, Document types, InputType classes
- Depends on: @nestjs/graphql, @nestjs/mongoose, mongoose
- Used by: Services, Resolvers, Modules
- Purpose: Database connectivity, schema registration, model injection
- Location: `src/mongo/mongo.module.ts`
- Contains: MongooseModule configuration, global feature registration for all schemas
- Depends on: MongooseModule.forRootAsync, ConfigService (environment-based URI and database name)
- Used by: All domain modules
- Purpose: Business logic, query/mutation/update operations, domain-specific logic
- Location: `src/{domain}/{domain}.service.ts` (e.g., `src/characters/characters.service.ts`, `src/roads/roads.service.ts`)
- Contains: CRUD operations, complex queries, transactions, graph algorithms, PubSub publication
- Depends on: Mongoose Models, injected dependencies (PubSub, Bull Queue, other services), external libraries (graphology)
- Used by: Resolvers, other services
- Purpose: HTTP → GraphQL translation, argument parsing, subscription setup
- Location: `src/{domain}/{domain}.resolver.ts`
- Contains: @Query, @Mutation, @Subscription decorators, error handling delegation
- Depends on: Service layer
- Used by: Apollo GraphQL server
- Purpose: Dependency injection setup, feature isolation, module boundaries
- Location: `src/{domain}/{domain}.module.ts`
- Contains: Feature module definition, local schema registration, provider/export setup
- Depends on: MongooseModule.forFeature, feature services
- Used by: AppModule
- Purpose: Asynchronous task execution with configurable delays and retry logic
- Location: `src/{domain}/*.processor.ts` (e.g., `src/characters/spell-recovery.processor.ts`)
- Contains: Bull @Processor decorated classes with @Process methods
- Depends on: @nestjs/bull, Mongoose Models
- Used by: Services (via Queue injection)
- Purpose: Real-time event distribution to GraphQL subscriptions
- Location: `src/pubsub.module.ts` (global), `src/{domain}/{domain}.service.ts` (publication)
- Contains: PubSub instance creation, event type definitions, MongoDB change stream listeners
- Depends on: @graphql-yoga/subscription, MongoDB change streams
- Used by: Resolvers (subscription endpoints), Services (event publishing)
## Data Flow
- Character updates trigger MongoDB change streams
- Change stream publications via PubSub reach all subscribed clients
- No client-side state cache — subscriptions provide real-time sync
- Background jobs persist state changes asynchronously via Bull
## Key Abstractions
- Purpose: Single source of truth for both API schema and DB schema
- Examples: `src/models/spell.model.ts`, `src/models/character/character.model.ts`, `src/models/road.model.ts`
- Pattern: Class decorated with @ObjectType (GraphQL) and @Schema (Mongoose), properties decorated with @Field and @Prop
- Purpose: Typed mutation/query arguments validated by GraphQL
- Examples: `src/models/request/use-spell-request.model.ts`, `src/models/request/equip-item-request.model.ts`
- Pattern: @InputType decorated classes, used as @Args in mutations
- Purpose: Reusable data structures (coins, equipment slots, damages, enums)
- Location: `src/models/common/`, `src/models/enums/`
- Examples: Equipment (with slot mapping), Coins (gold/silver/copper), EnergyDamage, AssetQuantity
- Purpose: Business logic with built-in event publishing for subscriptions
- Key pattern in `src/characters/characters.service.ts`: service injects @Inject('PUB_SUB') PubSub, publishes on state changes
- Enables transparent subscriptions without resolver-level complexity
- Purpose: Decoupled background job execution (spell recovery, scheduled events)
- Pattern: @Processor('queue-name') decorator, @Process('job-type') for handler
- Advantages: Persistent queue, failure retry, delayed execution, removal on completion
- Purpose: In-memory road network representation for efficient pathfinding
- Location: `src/roads/roads.service.ts`
- Pattern: Haversine distance for edge weights, Dijkstra for shortest path
## Entry Points
- Location: `src/main.ts`
- Triggers: `npm start`, `npm start:dev`
- Responsibilities: NestFactory.create(AppModule), listen on PORT (default 3000)
- Location: `src/app.module.ts`
- Triggers: Application bootstrap
- Responsibilities: Imports all feature modules, configures GraphQL (Apollo code-first), sets up Bull Redis, applies Mongoose plugin
- Path: `/api/graphql`
- Type: HTTP POST (queries/mutations), WebSocket (subscriptions)
- Serves: schema.gql (auto-generated), playground (introspection enabled)
- Pattern: Each module bootstraps its service and resolver
- Example: `src/characters/characters.module.ts` imports Character schema, exports CharactersService
- Service is instantiated once per module, available for injection to resolvers and other services
## Error Handling
- `NotFoundException`: Entity not found (404) — thrown in `findOne()` methods
- `BadRequestException`: Invalid request state (400) — thrown for spell state violations (already active, no usages)
- `Logger` in services: errors logged to console, change stream errors logged but not thrown (resilience)
- Change stream error handling: logged but listener continues (does not crash service)
- Job processing errors: logged, job remains in failed queue for inspection
## Cross-Cutting Concerns
- Via NestJS Logger service injected into each service
- Used for: change stream events, job processing, error conditions, graph build completion
- No centralized log aggregation configured; logs to stdout
- GraphQL schema validation (types, nullability)
- Manual validation in services (entity existence, business rule checks)
- No class-validator decorators observed; validation is procedural
- No auth layer detected in current codebase
- GraphQL introspection enabled (public API)
- No JWT/API key guards on resolvers
- `idTransformPlugin`: Mongoose schema plugin applied globally in AppModule constructor
- Transforms all documents: _id (ObjectId) → id (string), preserves virtuals
- Applied via `mongoose.plugin(idTransformPlugin)` before any schema creation
- Managed by MongooseModule.forRootAsync in MongoModule
- Connection string from environment variable MONGO_URI
- Database name from environment variable DB_NAME
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
