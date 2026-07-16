# Testing Patterns

**Analysis Date:** 2026-07-16

## Test Framework

**Runner:**
- Jest 30.0.0
- Config: Inline in `package.json` + separate E2E config at `test/jest-e2e.json`

**TypeScript Support:**
- ts-jest 29.2.5 for TS transpilation
- tsconfig-paths 4.2.0 for path resolution

**Assertion Library:**
- Jest built-in expect assertions

**HTTP Testing:**
- supertest 7.0.0 for E2E HTTP requests

**NestJS Testing:**
- @nestjs/testing 11.0.1 for Test.createTestingModule()

**Run Commands:**
```bash
npm run test              # Run unit tests (Jest unit tests in src/)
npm run test:watch       # Watch mode for unit tests
npm run test:cov         # Coverage report
npm run test:debug       # Debug mode with node inspector
npm run test:e2e         # E2E tests (test/ directory)
```

## Current Test Coverage State

**Status:** MINIMAL - Default scaffold only

**Existing Test Files:**
- `src/app.controller.spec.ts` - Scaffold unit test (1 passing test)
- `test/app.e2e-spec.ts` - Scaffold E2E test (1 passing test)

**Coverage:** No coverage baseline established. Coverage reports available via `npm run test:cov` but no CI enforcement.

**TDD Mandate:** Project requires TDD going forward — use this as baseline for future test development.

## Jest Configuration

**Unit Test Config (package.json):**
```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

**E2E Test Config (`test/jest-e2e.json`):**
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

## Test File Organization

**Location - Unit Tests:**
- Co-located with source: `src/{feature}/{feature}.spec.ts`
- Example: `src/app.controller.spec.ts` next to `src/app.controller.ts`

**Location - E2E Tests:**
- Separate directory: `test/` (e.g., `test/app.e2e-spec.ts`)
- Full module imports for integration testing

**Naming:**
- Unit: `{feature}.spec.ts`
- E2E: `{feature}.e2e-spec.ts`

**Expected Structure for New Tests:**
```
src/characters/
├── characters.service.ts
├── characters.service.spec.ts          # Unit test
├── characters.resolver.ts
├── characters.resolver.spec.ts         # Unit test
└── characters.module.ts

test/
├── characters.e2e-spec.ts              # Integration test
└── jest-e2e.json
```

## Test Structure Pattern

**Unit Test Template** (from `src/app.controller.spec.ts`):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
```

**Describe Blocks:**
- Feature name as top-level: `describe('AppController')`
- Logical grouping within: `describe('root')`

**Setup Pattern:**
- `beforeEach()` for test isolation
- `Test.createTestingModule()` for DI container
- `.compile()` to instantiate module
- `module.get<Type>(Type)` to extract dependencies

**Assertions:**
- Simple equality: `.toBe()`
- Jest matchers used directly

## E2E Test Structure Pattern

**E2E Test Template** (from `test/app.e2e-spec.ts`):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
```

**Differences from Unit:**
- Import entire `AppModule` (not individual providers)
- Create full application: `moduleFixture.createNestApplication()`
- Initialize: `await app.init()`
- Use supertest: `request(app.getHttpServer())` to make HTTP calls
- Assertions on HTTP response: `.expect(200).expect('Hello World!')`

**GraphQL E2E Pattern** (To be established):
- Should POST to `/api/graphql` endpoint
- Pass query/mutation as body
- Assert response data and errors

## Mocking

**Framework:** Jest built-in `jest.mock()` or manual mocks

**Manual Mock Pattern** (observed in module setup):
```typescript
const moduleFixture = await Test.createTestingModule({
  controllers: [AppController],
  providers: [AppService],  // Real or mocked via overrideProvider
}).compile();
```

**Override Pattern** (NestJS specific):
```typescript
Test.createTestingModule()
  .overrideProvider(SomeService)
  .useValue(mockService)
  .compile();
```

**What to Mock:**
- Database access (MongooseModule) → provide mock Model
- External APIs (Cloudinary) → provide mock service
- Bull queues → provide mock queue
- PubSub → provide mock PubSub instance

**What NOT to Mock:**
- NestJS core decorators and modules
- GraphQL type definitions
- Pure utility functions (should test directly)

## Database Testing

**Current Approach:** None observed

**Recommended for TDD:**
- Use MongoDB in-memory container (testcontainers or mongo-memory-server) for integration tests
- Mock Mongoose Model in unit tests
- Example for service test:
  ```typescript
  const mockCharacterModel = {
    findById: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
  };
  
  await Test.createTestingModule({
    providers: [
      CharactersService,
      {
        provide: getModelToken(Character),
        useValue: mockCharacterModel,
      },
    ],
  }).compile();
  ```

## Async Testing

**Pattern** (from E2E):
```typescript
it('/ (GET)', () => {
  return request(app.getHttpServer())  // Return Promise
    .get('/')
    .expect(200)
    .expect('Hello World!');
});
```

**Async/Await Alternative:**
```typescript
it('should find character', async () => {
  const character = await charactersService.findOne('123');
  expect(character).toBeDefined();
});
```

## Error Testing Pattern

**Recommended (not yet implemented):**
```typescript
it('should throw NotFoundException when character not found', async () => {
  mockCharacterModel.findById.mockResolvedValueOnce(null);
  
  await expect(
    charactersService.findOne('invalid-id')
  ).rejects.toThrow(NotFoundException);
});
```

## Fixtures and Test Data

**Current:** None organized

**Recommended Structure:**
```
test/fixtures/
├── character.fixture.ts      # Factory functions
├── spell.fixture.ts
└── mocks.ts                  # Mock service instances
```

**Example Factory Pattern:**
```typescript
export function createCharacterFixture(overrides?: Partial<Character>): Character {
  return {
    id: 'test-id',
    name: 'Test Character',
    status: {
      coins: { gold: 100, silver: 50, copper: 25 },
      spells: [],
    },
    assets: {
      ownedItems: [],
      activeSpells: [],
      wearedEquipment: {},
    },
    ...overrides,
  };
}
```

## Hooks and Teardown

**Current Pattern:**
- `beforeEach()` recreates module/app for isolation
- No explicit `afterEach()` observed (NestJS handles cleanup)

**Database Cleanup** (Needed for integration tests):
```typescript
afterEach(async () => {
  await mongoClient.close();
});

afterAll(async () => {
  await app.close();
});
```

## Coverage Requirements

**Current:** None enforced

**Recommended for TDD:**
- Minimum 80% line coverage on services
- 100% coverage on critical paths (transaction logic, error conditions)
- Run: `npm run test:cov` to generate coverage report
- Coverage output: `coverage/` directory (gitignored)

## Test Type Breakdown

**Unit Tests (to implement):**
- Service methods: business logic, transformations
- Resolver methods: argument passing to services
- Utility functions: edge cases and transformations
- Example scope: `CharactersService.findOne()` with various character states

**Integration Tests (to implement):**
- Service + Database: full flow with mocked Mongoose
- Service + Queue: Bull job scheduling and processing
- Module initialization: OnModuleInit, OnModuleDestroy hooks
- Example scope: Spell recovery job processing end-to-end

**E2E Tests (skeleton exists):**
- Full HTTP request/response cycle
- GraphQL queries and mutations
- Authentication (if applicable)
- Current only: GET / returns "Hello World!"
- Example to add: `POST /api/graphql` with character query

## Running Tests During Development

**Watch Mode:**
```bash
npm run test:watch
# Re-runs tests on file changes, great for TDD cycle
```

**Single File:**
```bash
npm run test -- characters.service.spec.ts
```

**Specific Suite:**
```bash
npm run test -- --testNamePattern="should throw"
```

**With Coverage:**
```bash
npm run test:cov -- --coverage
```

---

*Testing analysis: 2026-07-16*

**CRITICAL NOTE:** Testing is currently at the scaffold level only. The project mandates TDD going forward. Use this document as a reference for establishing test patterns for all new features. Start with service layer tests (easier to unit test) before resolver/E2E tests.
