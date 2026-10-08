# Coding Conventions

**Analysis Date:** 2026-07-16

## Naming Patterns

**Files:**
- Services: `{feature}.service.ts` (e.g., `characters.service.ts`)
- Resolvers: `{feature}.resolver.ts` (e.g., `characters.resolver.ts`)
- Modules: `{feature}.module.ts` (e.g., `characters.module.ts`)
- Models: `{entity}.model.ts` (e.g., `character.model.ts`, `spell.model.ts`)
- Request/Response DTOs: `{name}-request.model.ts`, `{name}-response.model.ts`
- Enums: `{entity}-type.enum.ts` or `{entity}_type.enum.ts` (inconsistent: both kebab and snake_case used)
- Processors: `{feature}.processor.ts` (e.g., `spell-recovery.processor.ts`)

**Functions:**
- Verb-based: `findAll()`, `findOne()`, `doTransaction()`, `equipItem()`, `handleSpellRecovery()`
- camelCase consistently used
- Private helper methods prefixed when needed: `private roundCoord()`, `private toRad()`

**Variables:**
- camelCase: `characterId`, `spellId`, `activeSpell`, `wearedEquipment`
- Constants in UPPER_SNAKE_CASE: `MAX_SNAP_DISTANCE_KM`, `R` (radius constant)
- Database model properties use camelCase: `ownedEquipments`, `activeSpells`, `wearedEquipment`

**Types/Enums:**
- PascalCase: `Character`, `Spell`, `Equipment`, `CommonResponse`
- Enum names PascalCase: `SlotType`, `ClassType`
- Enum values lowercase with camelCase properties: 
  ```typescript
  enum SlotType {
    arms = "arms",
    leftHand = "leftHand",
    firstAccessory = "firstAccessory"
  }
  ```

**Classes/Decorators:**
- @Injectable() for services and processors
- @Resolver() for GraphQL resolvers with entity: `@Resolver(() => Character)`
- @Module() for feature modules
- @Processor() for Bull job processors: `@Processor('spell-recovery')`
- @Field() for GraphQL schema fields
- @ObjectType() for output types
- @InputType() for input types

## Code Style

**Formatting:**
- Tool: Prettier 3.4.2
- Single quotes: ✓ enforced (`.prettierrc`: `"singleQuote": true`)
- Trailing commas: `all` (after all array/object elements)
- Indentation: 4 spaces (inferred from code style)
- Line length: No explicit limit detected

**Linting:**
- Tool: ESLint 9.18.0 with TypeScript 8.20.0
- Config: `eslint.config.mjs` (flat config format)
- Rules relaxed for flexibility:
  - `@typescript-eslint/no-explicit-any`: off
  - `@typescript-eslint/no-floating-promises`: warn
  - `@typescript-eslint/no-unsafe-argument`: warn
- Integrates: prettier for formatting rules

## Import Organization

**Order (from files examined):**
1. NestJS decorators and utilities: `import { Injectable, Logger, NotFoundException }`
2. NestJS specific modules: `import { InjectModel } from '@nestjs/mongoose'`
3. External libraries (Mongoose, Bull, GraphQL): `import { Model, Types } from 'mongoose'`
4. Internal models and types: `import { Character, CharacterDocument } from 'src/models/...'`
5. Services and utilities: `import { CharactersService } from './characters.service'`

**Path Aliases:**
- Uses absolute paths with `src/` prefix: `import { Character } from 'src/models/character/character.model'`
- No path aliases configured in `tsconfig.json` beyond base URL

## Error Handling

**Patterns - NestJS Exceptions:**
- `NotFoundException`: When entity not found
  ```typescript
  if (!character) {
    throw new NotFoundException(`Character with id ${id} not found`);
  }
  ```
- `BadRequestException`: For invalid requests or state violations
  ```typescript
  if (!knownSpellIds.includes(request.spellId)) {
    throw new BadRequestException(`Spell ${request.spellId} is not known by character ${request.id}`);
  }
  ```
- Exceptions are caught by NestJS GraphQL error handler automatically
- Always include descriptive message with IDs involved

**Error Messages:**
- English in code conditions
- User-facing messages in Italian (mixed in return responses)
  ```typescript
  return {
    response: 'Equipaggiamento cambiato con successo',
    successful: true,
  };
  ```

## Logging

**Framework:** NestJS Logger

**Initialization Pattern:**
```typescript
@Injectable()
export class CharactersService {
  private readonly logger = new Logger(CharactersService.name);
  
  constructor(...) {}
}
```

**Usage Levels:**
- `this.logger.log()` - General information, operation success
  ```typescript
  this.logger.log(`Spell ${request.spellId} used by character ${request.characterId}`);
  ```
- `this.logger.warn()` - Non-critical issues, fallback behavior
  ```typescript
  this.logger.warn(`Character ${characterId} not found, skipping recovery`);
  ```
- `this.logger.error()` - Exceptions and critical failures
  ```typescript
  this.logger.error('Errore nel change stream', err);
  ```

**Message Language:** Mixed Italian and English
- Log messages often in Italian for context: "Errore nel change stream MongoDB"
- Condition descriptions in English: "not found", "skipping recovery"

**Migration Note:** Codebase moving away from `console.log()` toward Logger (Logger present in recent code, console references removed)

## Comments

**When to Comment:**
- Minimal comments observed; code should be self-documenting
- Italian inline comments explaining complex logic:
  ```typescript
  // Assicurati che questi import siano corretti per i tuoi modelli e librerie
  ```
- No JSDoc/TSDoc annotations observed

## Function Design

**Size:** Functions range from single-purpose helpers (10-15 lines) to business logic (40-60 lines)

**Parameters:**
- Prefer Request/Response DTOs over multiple parameters
  ```typescript
  async equipItem(request: EquipItemRequest): Promise<CommonResponse>
  ```
- GraphQL decorators handle argument extraction
  ```typescript
  @Args('request', { type: () => TransactionRequest }) request: TransactionRequest
  ```

**Return Values:**
- GraphQL operations: return typed objects (`Character`, `CommonResponse`, etc.)
- Services return domain models or responses
- Async/Promise used for all I/O operations
- Null handling: Check before processing, throw exception if required entity missing

## GraphQL Response Pattern

**CommonResponse:**
Standard return type for mutations affecting state:
```typescript
return {
  response: 'Operazione riuscita',  // User-facing message in Italian
  successful: true,                 // Boolean success flag
};
```
Located in `src/models/common/common-response.model.ts`

## Module Design

**Exports:**
- Modules export main Service for cross-module use
  ```typescript
  @Module({
    exports: [CharactersService],
  })
  ```
- Resolvers are providers, not exported (used internally)

**File Structure per Feature:**
```
src/{featureName}/
├── {feature}.module.ts      # Module definition
├── {feature}.service.ts     # Business logic
├── {feature}.resolver.ts    # GraphQL endpoints
├── {feature}.processor.ts   # Bull queue processor (if async jobs)
└── [sub-features]/          # Nested features if needed
```

**Dependency Injection:**
- Constructor injection standard
- @Inject() for non-class providers (PubSub, queues)
- @InjectModel() for Mongoose models
- @InjectQueue() for Bull queues

## TypeScript Configuration

**Key Settings:**
- `strictNullChecks: true` - Null/undefined safety enforced
- `noImplicitAny: false` - Any type allowed for flexibility
- `emitDecoratorMetadata: true` - Required for NestJS decorators
- `experimentalDecorators: true` - Decorator support enabled
- `target: esnext` - Modern JavaScript output

---

*Convention analysis: 2026-07-16*
