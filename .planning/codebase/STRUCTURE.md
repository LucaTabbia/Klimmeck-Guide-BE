# Codebase Structure

**Analysis Date:** 2026-07-16

## Directory Layout

```
Klimmeck-Guide-BE/
├── src/
│   ├── main.ts                          # Application entry point
│   ├── app.module.ts                    # Root module (imports all feature modules)
│   ├── app.controller.ts                # Health check endpoint
│   ├── app.service.ts                   # Basic app service
│   ├── app.controller.spec.ts           # Test for controller
│   ├── mongoose.plugins.ts              # Global Mongoose plugin (idTransformPlugin)
│   ├── pubsub.module.ts                 # Global PubSub module (GraphQL-Yoga subscriptions)
│   ├── utils.ts                         # Utility functions (e.g., normalizeCoins)
│   ├── schema.gql                       # Auto-generated GraphQL schema
│   │
│   ├── models/                          # Data models (GraphQL ObjectTypes + Mongoose Schemas)
│   │   ├── character/                   # Character model and sub-models
│   │   │   ├── character.model.ts       # Main Character class (@ObjectType @Schema)
│   │   │   ├── character-infos.model.ts # Character metadata (name, class, race, etc.)
│   │   │   ├── character-status.model.ts # Character state (location, coins, spells, health)
│   │   │   ├── character-quests.model.ts # Character quest progress
│   │   │   └── character-assets.model.ts # Character inventory (equipment, items, activeSpells)
│   │   ├── common/                      # Shared model types
│   │   │   ├── equipment.model.ts       # Equipment slot mapping
│   │   │   ├── asset-quantity.model.ts  # Item + quantity wrapper
│   │   │   ├── active-spell.model.ts    # Spell instance with usage count
│   │   │   ├── coins.model.ts           # Gold/Silver/Copper currency
│   │   │   ├── damages.model.ts         # Damage type union
│   │   │   ├── energy-damage.ts         # Spell energy consumption
│   │   │   ├── base-damage.model.ts     # Base damage calculation
│   │   │   ├── common-response.model.ts # Standard mutation response (success, message)
│   │   │   └── item.union.ts            # GraphQL union of item types
│   │   ├── enums/                       # Game enums
│   │   │   ├── class-type.enum.ts       # Character classes
│   │   │   ├── race-type.enum.ts        # Character races
│   │   │   ├── slot-type.enum.ts        # Equipment slots (head, chest, legs, etc.)
│   │   │   ├── use-type.enum.ts         # Spell use type
│   │   │   ├── rarity-type.enum.ts      # Item rarity
│   │   │   ├── damage-type.enum.ts      # Damage types (physical, fire, etc.)
│   │   │   ├── city-type.enum.ts        # City classifications
│   │   │   ├── poi-type.enum.ts         # Point of Interest types
│   │   │   └── *.enum.ts                # Other game enums
│   │   ├── request/                     # GraphQL InputType for mutations
│   │   │   ├── transaction-request.model.ts  # Buy/sell items and coins
│   │   │   ├── equip-item-request.model.ts   # Equip/unequip gear
│   │   │   ├── equip-spell-request.model.ts  # Equip/unequip spells
│   │   │   └── use-spell-request.model.ts    # Use spell (triggers recovery)
│   │   ├── quest/                       # Quest models and sub-models
│   │   ├── character/                   # Character domain models
│   │   ├── city.model.ts                # City entity
│   │   ├── enemy.model.ts               # Enemy NPC
│   │   ├── equipment-item.model.ts      # Equipment item catalog
│   │   ├── loot-item.model.ts           # Loot/consumable item catalog
│   │   ├── lore.model.ts                # Lore/story entry
│   │   ├── pet.model.ts                 # Pet entity
│   │   ├── point-of-interest.model.ts   # POI (geographic point on map)
│   │   ├── road.model.ts                # Road entity (for pathfinding)
│   │   ├── spell.model.ts               # Spell catalog
│   │   ├── user.model.ts                # User account
│   │   ├── pending-quest.model.ts       # Active quest instance
│   │   ├── notification.model.ts        # Notification message
│   │   ├── path-response.model.ts       # Path query response (distance, time)
│   │   └── interfaces/                  # TypeScript interfaces (if any)
│   │
│   ├── mongo/                           # Mongoose configuration and initialization
│   │   ├── mongo.module.ts              # Global Mongoose setup (connection + schema registration)
│   │   └── mongo.service.ts             # Utility service for MongoDB operations
│   │
│   ├── rest/                            # External service integrations
│   │   └── cloudinary/                  # Image/file upload service
│   │       ├── cloudinary.module.ts     # Cloudinary module
│   │       ├── cloudinary.service.ts    # Upload/transform logic
│   │       └── cloudinary.controller.ts # REST endpoints for uploads
│   │
│   ├── characters/                      # Characters domain module
│   │   ├── characters.module.ts         # Feature module
│   │   ├── characters.resolver.ts       # GraphQL queries, mutations, subscriptions
│   │   ├── characters.service.ts        # Business logic (findOne, doTransaction, useSpell, etc.)
│   │   └── spell-recovery.processor.ts  # Bull job processor (async spell recovery)
│   │
│   ├── cities/                          # Cities domain module
│   │   ├── cities.module.ts
│   │   ├── cities.resolver.ts
│   │   └── cities.service.ts
│   │
│   ├── enemies/                         # Enemies domain module
│   │   ├── enemies.module.ts
│   │   ├── enemies.resolver.ts
│   │   └── enemies.service.ts
│   │
│   ├── equipmentItems/                  # Equipment items catalog module
│   │   ├── equipment-items.module.ts
│   │   ├── equipment-items.resolver.ts
│   │   └── equipment-items.service.ts
│   │
│   ├── lootItems/                       # Loot items catalog module
│   │   ├── loot-items.module.ts
│   │   ├── loot-items.resolver.ts
│   │   └── loot-items.service.ts
│   │
│   ├── lore/                            # Lore/story domain module
│   │   ├── lore.module.ts
│   │   ├── lore.resolver.ts
│   │   └── lore.service.ts
│   │
│   ├── pendingQuests/                   # Active quest instances module
│   │   ├── pending-quests.module.ts
│   │   ├── pending-quests.resolver.ts
│   │   └── pending-quests.service.ts
│   │
│   ├── pets/                            # Pets domain module
│   │   ├── pets.module.ts
│   │   ├── pets.resolver.ts
│   │   └── pets.service.ts
│   │
│   ├── pointsOfInterest/                # POI (map locations) module
│   │   ├── point-of-interest.module.ts
│   │   ├── point-of-interest.resolver.ts
│   │   └── point-of-interest.service.ts
│   │
│   ├── quests/                          # Quest catalog module
│   │   ├── quests.module.ts
│   │   ├── quests.resolver.ts
│   │   └── quests.service.ts
│   │
│   ├── roads/                           # Road pathfinding module (graphology-based)
│   │   ├── roads.module.ts
│   │   ├── roads.resolver.ts
│   │   └── roads.service.ts             # Dijkstra pathfinding, haversine distance
│   │
│   ├── spells/                          # Spells catalog module
│   │   ├── spells.module.ts
│   │   ├── spells.resolver.ts
│   │   └── spells.service.ts
│   │
│   ├── spellRecovery/                   # PLACEHOLDER DIRECTORY (empty, see concern in CONCERNS.md)
│   │
│   └── users/                           # User accounts module
│       ├── users.module.ts
│       ├── users.resolver.ts
│       └── users.service.ts
│
├── test/
│   ├── app.e2e-spec.ts                  # E2E tests
│   └── jest-e2e.json                    # Jest E2E configuration
│
├── dist/                                # Compiled output (generated by `npm run build`)
├── coverage/                            # Test coverage (generated by `npm run test:cov`)
├── node_modules/                        # Dependencies
├── .env                                 # Environment configuration (not versioned)
├── package.json                         # Dependencies and scripts
├── package-lock.json                    # Dependency lock
├── tsconfig.json                        # TypeScript configuration
├── jest.config.js                       # Jest test configuration
├── .prettierrc                          # Code formatter config
├── .eslintrc.js                         # Linter config
└── README.md                            # Project documentation
```

## Directory Purposes

**src/models/**
- Purpose: Single source of truth for data contracts (GraphQL + MongoDB)
- Contains: @ObjectType + @Schema decorated classes, InputTypes for mutations, shared types
- Key files: Character hierarchy, Equipment, Spells, POIs, common types
- Access pattern: Imported by modules for schema registration, by resolvers for type hints

**src/mongo/**
- Purpose: Centralized MongoDB connection and Mongoose schema registration
- Contains: Global @Module import, connection configuration, schema feature registration
- Key files: `mongo.module.ts` (registers all schemas globally)
- Access pattern: Imported as global module in AppModule

**src/{domain}/**
- Purpose: Isolated domain module (DDD pattern)
- Contains: Resolver, Service, Module, optional Processor
- Pattern: Each domain folder handles one entity (characters, roads, spells, etc.)
- Module structure: `{domain}.module.ts` imports schemas locally, exports service for other modules
- Service pattern: Contains all business logic, optionally publishes PubSub events
- Resolver pattern: Routes GraphQL operations to service methods

**src/rest/**
- Purpose: External service integrations and REST endpoints
- Contains: Cloudinary integration (image uploads)
- Access pattern: Services can inject CloudinaryService for file operations

## Key File Locations

**Entry Points:**
- `src/main.ts`: Application bootstrap (NestFactory.create, app.listen)
- `src/app.module.ts`: Root module (imports all features, GraphQL/Bull config)

**Configuration:**
- `src/app.module.ts`: GraphQL Apollo config, Bull Redis config, schema registration
- `src/mongo/mongo.module.ts`: MongoDB connection (async ConfigService-based)
- `src/pubsub.module.ts`: PubSub instance (@Global, exported to all modules)

**Core Logic:**
- `src/characters/characters.service.ts`: Character CRUD, spells, equipment, transactions
- `src/roads/roads.service.ts`: Graph construction, pathfinding (Dijkstra), haversine distance
- `src/characters/spell-recovery.processor.ts`: Bull job processor for spell cooldown recovery

**Models:**
- `src/models/character/character.model.ts`: Main Character class (composed of sub-models)
- `src/models/spell.model.ts`: Spell catalog entry
- `src/models/common/`: Shared types (Equipment, Coins, Damages)
- `src/models/enums/`: Game enums (ClassType, RaceType, SlotType, etc.)

**GraphQL:**
- `src/schema.gql`: Auto-generated schema (created by `npm start` or `npm run build`)
- `src/{domain}/{domain}.resolver.ts`: Resolvers for domain queries/mutations/subscriptions

## Naming Conventions

**Files:**
- Domain modules: camelCase folder name, e.g., `src/characters/`, `src/lootItems/`
- Services: `{domain}.service.ts`, e.g., `characters.service.ts`
- Resolvers: `{domain}.resolver.ts`, e.g., `characters.resolver.ts`
- Modules: `{domain}.module.ts`, e.g., `characters.module.ts`
- Processors: `{name}.processor.ts`, e.g., `spell-recovery.processor.ts`
- Models: `{entity}.model.ts`, e.g., `spell.model.ts`, or `{entity}/{sub-entity}.model.ts` (e.g., `character/character-infos.model.ts`)
- Enums: `{type}.enum.ts`, e.g., `class-type.enum.ts`
- Controllers: `{domain}.controller.ts` (rare, only Cloudinary has one)

**Classes:**
- PascalCase: `CharactersService`, `SpellRecoveryProcessor`, `Character`, `Spell`
- Suffixes: `Service`, `Resolver`, `Module`, `Processor`, `Controller`

**Variables/Functions:**
- camelCase: `findOne()`, `doTransaction()`, `getShortestPath()`, `characterUpdated`
- Event names: camelCase, e.g., `'characterUpdated'` (used in PubSub)

**GraphQL Types:**
- PascalCase for ObjectType/InputType: `Character`, `Spell`, `UseSpellRequest`
- Query fields: camelCase, e.g., `character()`, `getPath()`
- Mutation fields: camelCase verb-noun pattern, e.g., `useSpell()`, `equipItem()`
- Subscription fields: past tense or descriptor, e.g., `characterUpdated`

**Enums:**
- PascalCase class name: `ClassType`, `RaceType`, `SlotType`
- UPPER_SNAKE_CASE values: `WARRIOR`, `PALADIN` (from enums), or human-readable strings

## Where to Add New Code

**New Domain Entity:**
1. Create model: `src/models/{entity}.model.ts` or `src/models/{entity}/{entity}.model.ts`
   - Decorate class with @ObjectType() and @Schema()
   - Add @Field/@Prop decorators for each property
   - Export {Entity}Document type and {Entity}Schema
2. Register schema: Add to `src/mongo/mongo.module.ts` in MongooseModule.forFeature
3. Create domain module: `src/{entity}/{entity}.module.ts`
   - Import MongooseModule.forFeature([{name: Entity.name, schema: EntitySchema}])
   - Create `{entity}.service.ts` with business logic
   - Create `{entity}.resolver.ts` with @Query/@Mutation/@Subscription decorators
   - Register both in module's providers and exports
4. Import module in `src/app.module.ts`

**New Mutation with Request Type:**
1. Create InputType: `src/models/request/{action}-request.model.ts`
   - Decorate with @InputType()
   - Add @Field decorators for input fields
2. Add method to service: `src/{domain}/{domain}.service.ts`
   - Implement business logic
   - Throw NestJS exceptions on validation failure
   - Optionally publish PubSub event on success
3. Add mutation to resolver: `src/{domain}/{domain}.resolver.ts`
   - Decorate with @Mutation(() => ReturnType)
   - Accept @Args('request', { type: () => RequestType }) request: RequestType
   - Call service method and return result

**New GraphQL Subscription:**
1. Add PubSub event type: Update `src/pubsub.module.ts` PubSubEvents type
2. Publish event in service: `this.pubSub.publish('eventName', { eventName: data })`
3. Add subscription to resolver:
   ```typescript
   @Subscription(() => EntityType, {
       name: 'eventName',
       filter: (payload, variables) => {
           // Optional: filter events per client
           return payload.eventName.id === variables.id;
       },
   })
   eventName(@Args('id') id: string) {
       return this.pubSub.subscribe('eventName');
   }
   ```

**New Bull Background Job:**
1. Create processor: `src/{domain}/{job-name}.processor.ts`
   - Decorate class with @Processor('queue-name')
   - Add @Process('job-type') method
   - Inject models needed for job logic
2. Register processor: Add to feature module's providers
3. Register queue: Add to module's imports: `BullModule.registerQueue({ name: 'queue-name' })`
4. Enqueue job in service:
   ```typescript
   @InjectQueue('queue-name') private queue: Queue<JobDataType>
   await this.queue.add('job-type', jobData, { 
       delay: ms, 
       jobId: uniqueId,
       removeOnComplete: true 
   })
   ```

**New Enum:**
- Location: `src/models/enums/{type}.enum.ts`
- Format: Export TypeScript enum or GraphQL enum decorator
- Usage: Import and use in model @Field/@Prop with enum option

**Shared Utility:**
- Location: `src/utils.ts` or `src/{domain}/utils.ts`
- Export named functions
- Import and use across services

## Special Directories

**src/spellRecovery/:**
- Purpose: Placeholder directory (currently empty)
- Status: Empty — actual spell recovery job processing is in `src/characters/spell-recovery.processor.ts`
- Note: Directory exists but should be removed or consolidated (see CONCERNS.md)
- Committed: Yes (git tracks empty dirs as .gitkeep files if any)

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: `npm run build`
- Committed: No (.gitignore excludes dist/)

**coverage/:**
- Purpose: Jest test coverage reports
- Generated: `npm run test:cov`
- Committed: No (.gitignore excludes coverage/)

**src/schema.gql:**
- Purpose: Auto-generated GraphQL schema (introspection)
- Generated: npm start or build
- Committed: Yes (tracked for reference)
- Update: Regenerated on each build/start (do not manually edit)

---

*Structure analysis: 2026-07-16*
