# External Integrations

**Analysis Date:** 2026-07-16

## APIs & External Services

**Image/Media Management:**
- Cloudinary - Cloud-based image upload, storage, and transformation
  - SDK: `cloudinary` 1.41.3
  - Service: `src/rest/cloudinary/cloudinary.service.ts`
  - Controller: `src/rest/cloudinary/cloudinary.controller.ts`
  - Environment: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - Endpoints:
    - `POST /cloudinary/uploadImage` - Upload character profile images to `characters_profile` folder
    - `POST /cloudinary/getUrls` - List all resources in a folder
    - `POST /cloudinary/getSubfoldersUrls` - List resources across subfolders
  - Adapter: `multer-storage-cloudinary` 4.0.0 for Express multipart form handling

**Telegram Integration (Model Support):**
- Models reference Telegram bot integration (see `src/models/user.model.ts`)
- Status: **Model fields present, no implementation detected**
- Note: README.md states app integrates with Telegram and Discord but no active service/controller found in codebase

**Discord Integration (Model Support):**
- Models reference Discord integration (see `src/models/user.model.ts`)
- Status: **Model fields present, no implementation detected**
- Note: README.md states integration exists but no active service/controller found in codebase

## Data Storage

**Primary Database:**
- MongoDB
  - Connection: via `process.env.MONGO_URI` (loaded in `src/mongo/mongo.module.ts:28`)
  - Database name: via `process.env.DB_NAME` (loaded in `src/mongo/mongo.module.ts:29`)
  - Client: `mongoose` 8.18.1 (ODM with native MongoDB driver 6.19.0)
  - Module: `src/mongo/mongo.module.ts` (Global, auto-registered in `src/app.module.ts:44`)
  - Collections defined:
    - User
    - Character
    - City
    - Enemy
    - EquipmentItem
    - LootItem
    - Lore
    - PendingQuest
    - Pet
    - Quest
    - Spell
    - PointOfInterest

**Cache & Job Queue:**
- Redis (via ioredis 5.7.0)
  - Purpose: Bull job queue storage
  - Host: `REDIS_HOST` (default: 'localhost')
  - Port: `REDIS_PORT` (default: 6379)
  - Configuration: `src/app.module.ts:35-43`
  - Queue: `spell-recovery` (defined in `src/characters/characters.module.ts:16-18`)

**File Storage:**
- Cloudinary (see APIs section above)
- No local filesystem storage configured

## Authentication & Identity

**Auth Provider:**
- None detected
- Status: **NOT IMPLEMENTED**

**Known Auth Gaps:**
- No Passport.js integration
- No JWT/bearer token validation
- No OAuth (Twitch, Discord, etc.)
- No session management
- Models reference `twitchId` and `twitchPoints` (see `src/models/user.model.ts`) but **no Twitch OAuth flow implemented**
- No role-based access control (RBAC) guards
- GraphQL endpoint at `/api/graphql` is publicly accessible with introspection enabled (see `src/app.module.ts:51`)

**Recommendation:** Authentication must be added as a phase before production deployment.

## Monitoring & Observability

**Error Tracking:**
- Not detected

**Logging:**
- NestJS built-in Logger (see `src/characters/spell-recovery.processor.ts:15`)
- Loggers configured per service/processor
- No centralized error reporting service

**GraphQL Introspection:**
- Enabled in `src/app.module.ts:51` - **visible in production**
- GraphQL playground disabled (`playground: false` in `src/app.module.ts:48`)
- Apollo landing page: default landing page

## Real-Time Communication

**GraphQL Subscriptions:**
- Protocol: graphql-ws (configured in `src/app.module.ts:54-56`)
- Implementation: `@graphql-yoga/subscription` 5.0.5
- PubSub: `src/pubsub.module.ts` (Global provider)
  - Type-safe events: `PubSubEvents` (only `characterUpdated` defined)
  - Client: `createPubSub<PubSubEvents>()` from @graphql-yoga/subscription
- Subscription handlers: Installed via Apollo Server (installSubscriptionHandlers: true)
- WebSocket: Standard graphql-ws protocol over WebSocket

## Push Notifications

**FCM (Firebase Cloud Messaging):**
- Status: **NOT IMPLEMENTED**
- No firebase-admin SDK found
- No push notification infrastructure configured

**Recommendation:** Consider adding FCM integration for mobile game notifications.

## Job Queuing

**Bull Queue System:**
- Framework: `bull` 4.16.5 with `@nestjs/bull` 11.0.3
- Storage: Redis via `ioredis` 5.7.0
- Configuration: `src/app.module.ts:35-43` (BullModule.forRootAsync)
- Queue Name: `spell-recovery`
- Processor: `src/characters/spell-recovery.processor.ts`
  - Job Interface: `SpellRecoveryJobData { characterId: string; spellId: string }`
  - Process: `recover` job type recovers spell usages after cooldown
  - Logging: Uses NestJS Logger to track recovery progress
- Injection: Via `@InjectQueue('spell-recovery')` (see `src/characters/characters.service.ts`)

## Pathfinding & Graph Algorithms

**Graph Library:**
- graphology 0.26.0 - Graph data structure
- graphology-shortest-path 2.1.0 - Dijkstra algorithm
- Implementation: `src/roads/roads.service.ts`
  - Builds road network graph on module init
  - Uses Haversine distance for geospatial calculations
  - Finds shortest path between points of interest
  - Snap distance for road entry: 5km

## WebServer Configuration

**Server Setup:**
- Express (via @nestjs/platform-express 11.0.1)
- Port: `process.env.PORT` (default: 3000, see `src/main.ts:6`)
- Bind address: `0.0.0.0` (accepts connections from any interface)
- GraphQL endpoint: `/api/graphql`

## Third-Party Service Dependencies

**Not Detected (Verified):**
- Google Firebase / FCM
- Twitch OAuth / API (models ready but no auth flow)
- AWS SDK
- Stripe / Payment processors
- SendGrid / Email services
- SMS providers
- Datadog / New Relic / APM

---

## Security Notes

**Current State:**
- GraphQL introspection enabled (schema fully visible)
- No authentication implemented
- Redis/MongoDB credentials via environment variables only
- Cloudinary credentials in environment (never logged or exposed)
- No CORS policy defined (defaults to permissive)
- No rate limiting detected

**Before Production:**
1. Implement authentication layer (Passport + JWT or OAuth)
2. Disable GraphQL introspection in production
3. Configure CORS for known client domains
4. Add rate limiting middleware
5. Implement request validation guards
6. Add error boundary handling (avoid exposing stack traces)

---

*Integration audit: 2026-07-16*
