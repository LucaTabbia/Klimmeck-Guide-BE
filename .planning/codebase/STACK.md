# Technology Stack

**Analysis Date:** 2026-07-16

## Languages

**Primary:**
- TypeScript 5.7.3 - All source code, configuration, and tests

**Compiled Target:**
- JavaScript (ESNext) - Compiled via NestJS build toolchain

## Runtime

**Environment:**
- Node.js (latest LTS compatible via ESNext compilation)

**Package Manager:**
- Yarn 1.22.22+sha512...
- Lockfile: `package-lock.json` (npm format, managed via Yarn)

## Frameworks

**Core:**
- NestJS 11.0.1 - Application framework, dependency injection, CLI tooling
- Express 5.0.0 (via @nestjs/platform-express) - HTTP server provider

**GraphQL:**
- @nestjs/graphql 13.2.0 - NestJS GraphQL integration
- Apollo 13.1.0 (@nestjs/apollo) - GraphQL server driver
- graphql 16.11.0 - Core GraphQL implementation
- graphql-subscriptions 3.0.0 - PubSub mechanism for real-time updates
- @graphql-yoga/subscription 5.0.5 - GraphQL Yoga subscription support
- graphql-ws (configured in app.module.ts:55) - WebSocket protocol for subscriptions

**Database:**
- Mongoose 8.18.1 - MongoDB object document mapper (ODM)
- @nestjs/mongoose 11.0.3 - NestJS Mongoose integration
- MongoDB 6.19.0 - Native MongoDB driver (used by Mongoose)

**Task Queue:**
- Bull 4.16.5 - Job queue library
- @nestjs/bull 11.0.3 - NestJS Bull integration
- ioredis 5.7.0 - Redis client for Bull queue storage

**File Upload:**
- multer - Express file upload middleware
- @nestjs/platform-express - Multer integration for NestJS
- multer-storage-cloudinary 4.0.0 - Cloudinary storage adapter for Multer
- Cloudinary 1.41.3 - Cloud image/media management SDK

**Pathfinding & Graph Algorithms:**
- graphology 0.26.0 - Graph data structure library
- graphology-shortest-path 2.1.0 - Dijkstra shortest path implementation

## Testing

**Framework:**
- Jest 30.0.0 - Test runner and assertion library
- ts-jest 29.2.5 - TypeScript support for Jest
- @nestjs/testing 11.0.1 - NestJS test utilities
- supertest 7.0.0 - HTTP assertion library for integration tests

**Type Support:**
- @types/jest 30.0.0
- @types/node 22.10.7
- @types/express 5.0.0
- @types/multer 2.0.0
- @types/bull 3.15.9
- @types/supertest 6.0.2

## Build & Development Tools

**Build:**
- @nestjs/cli 11.0.0 - NestJS command-line tools
- @nestjs/schematics 11.0.0 - Code generators for NestJS
- ts-loader 9.5.2 - TypeScript webpack loader
- ts-node 10.9.2 - TypeScript execution for Node.js

**Code Quality:**
- ESLint 9.18.0 - Linting
  - @eslint/js 9.18.0
  - typescript-eslint 8.20.0
  - eslint-config-prettier 10.0.1
  - eslint-plugin-prettier 5.2.2
- Prettier 3.4.2 - Code formatting

**TypeScript Tools:**
- tsconfig-paths 4.2.0 - Path alias resolution
- source-map-support 0.5.21 - Production stack trace mapping
- reflect-metadata 0.2.2 - Decorator metadata support (required by NestJS)

**Utilities:**
- rxjs 7.8.1 - Reactive streams (used by NestJS internally)
- dotenv 17.2.2 - Environment variable loading (manually used in ConfigModule)
- @nestjs/config 4.0.2 - NestJS config management

## Configuration

**Environment:**
- Configuration via `ConfigModule.forRoot()` in `src/app.module.ts:31-34`
- Environment file: `.env` (present but not read here per security policy)
- Loaded globally for all modules

**Key Environment Variables Required:**
- `PORT` - Server port (default: 3000, see `src/main.ts:6`)
- `MONGO_URI` - MongoDB connection string (loaded in `src/mongo/mongo.module.ts:28`)
- `DB_NAME` - MongoDB database name (loaded in `src/mongo/mongo.module.ts:29`)
- `REDIS_HOST` - Redis host for Bull queue (default: 'localhost', see `src/app.module.ts:39`)
- `REDIS_PORT` - Redis port for Bull queue (default: 6379, see `src/app.module.ts:40`)
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud identifier (see `src/rest/cloudinary/cloudinary.service.ts:8`)
- `CLOUDINARY_API_KEY` - Cloudinary API key (see `src/rest/cloudinary/cloudinary.service.ts:9`)
- `CLOUDINARY_API_SECRET` - Cloudinary API secret (see `src/rest/cloudinary/cloudinary.service.ts:10`)

**Build Configuration:**
- `tsconfig.json` - TypeScript compiler configuration with NestJS decorators enabled
- `nest-cli.json` - NestJS CLI configuration with source root at `src/`
- `tsconfig.build.json` - Build-specific TypeScript configuration
- `package.json` Jest configuration (lines 73-89)

**Linting & Formatting:**
- `.prettierrc` - Prettier config: single quotes, trailing commas
- ESLint configured via ESLint v9 flat config (ESLint 9.18.0, @eslint/js 9.18.0)

## Platform Requirements

**Development:**
- Node.js (LTS or current)
- Yarn 1.22.22+
- Redis server (for Bull queue)
- MongoDB server (local or remote)
- Cloudinary account (for image storage)

**Production:**
- Node.js LTS (production-grade runtime)
- Redis instance (separate from development)
- MongoDB instance (separate from development, production-grade)
- Cloudinary account credentials
- Environment variables configured securely

**Scripts:**
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

---

*Stack analysis: 2026-07-16*
