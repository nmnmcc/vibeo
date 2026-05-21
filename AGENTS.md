## Vendored References

This project vendors external repositories under `references/` for agent-readable source context.
Reference setup follows [The One Weird Git Trick That Makes Coding Agents More Effect-ive](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/).

- Treat files under `references/` as read-only reference material unless the user explicitly asks to update or patch a reference subtree.
- Prefer patterns, examples, tests, and module structure from the vendored source over guesses or web search when working with related libraries.
- Do not import application code from `references/`; keep imports pointed at normal package dependencies.
- Do not include `references/` in formatting, linting, build, or application edits unless explicitly requested.

### Available References

- `references/effect-smol`: use when writing Effect v4 / `effect-smol` code. Inspect its source, tests, docs, and `LLMS.md` when present for idiomatic Effect patterns.
- `references/openai-agents-js`: use when writing JavaScript/TypeScript code with `@openai/agents`. Inspect its `packages/`, `examples/`, `docs/`, and tests for API usage and agent workflow patterns.

## Service Development Guidelines

This section defines the common pattern for domain services under `workspaces/server/main/src/services/*`.
When adding a new service, prefer these rules unless the service has a clearly different boundary.

### Directory Boundaries

- Use one directory per domain service, such as `services/profile/`.
- Put the service entrypoint in `index.ts`, and export the service class, shape, domain types, and error types from there.
- Keep database table definitions in `services/database/schemas/`; services should import table objects only from the schema entrypoint.
- Auth lives in `workspaces/server/main/src/services/auth`. When a domain service needs to reference the logged-in user, store an external identifier such as the auth user id; do not couple the service directly to Better Auth's internal table structure.

### Service Structure

- Define services with `Context.Service`; do not use the older `Context.Tag` / `Effect.Tag` style.
- Name the service class after the domain, such as `Profile`, `Works`, or `Annotations`.
- Define the service shape separately as `XxxShape`; every method must return an `Effect.Effect`.
- Use globally unique service ids. Domain services should use `openworks-server-main/<Domain>Service`, such as `openworks-server-main/ProfileService`.
- Expose the main implementation as `public static readonly layer = Layer.effect(...)`.
- Inside the layer, acquire dependencies explicitly with code such as `const database = yield* Database`.
- Define service methods and private effect helpers that depend on the database inside the `Layer.effect` construction closure, then assemble the public shape with `Xxx.of({ ... })`.

Recommended skeleton:

```ts
export type ExampleShape = {
  readonly getById: (id: string) => Effect.Effect<Example.Example, Example.Error.NotFound | EffectDrizzleQueryError>;
};

export class Example extends Context.Service<Example, ExampleShape>()("openworks-server-main/ExampleService") {
  public static readonly layer = Layer.effect(
    Example,
    Effect.gen(function* () {
      const database = yield* Database;

      const getById = Effect.fn("ExampleService.getById")((id: string) =>
        database
          .select()
          .from(examples)
          .where(eq(examples.id, id))
          .limit(1)
          .pipe(
            Effect.map(Array.head),
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new Example.Error.NotFound({ id })),
                onSome: Effect.succeed,
              }),
            ),
          ),
      );

      return Example.of({ getById });
    }),
  );
}
```

### Code Organization

- Organize single-file services in this order: imports, `XxxShape`, service class, same-name namespace, file-local constants/codecs/pure helpers.
- The service class should only declare the Effect service, build the layer, and assemble method implementations. Do not put domain types in the class body.
- Put private effect helpers that need `Database` or other layer dependencies inside the `Layer.effect` closure, near the public methods, such as `ensureUsernameAvailable`. These helpers should still be named with `Effect.fn`, but they should not be added to `XxxShape` or exported.
- Use TypeScript class + namespace merging for domain types: place `export namespace Profile { ... }` immediately after `export class Profile ...`.
- The namespace should contain only externally meaningful domain types and value constructors, such as `Profile.Profile`, `Profile.Input.Upsert`, and `Profile.Error.NotFound`.
- Organize the namespace with stable groups such as `Profile`, `Input`, and `Error`; avoid flattening everything into names like `ProfileUpsertInput` or `ProfileNotFound`.
- Put private implementation details that do not depend on a layer after the namespace, such as error reason constants, `Schema.asClass` codecs, and pure `validateUsername` / `normalizeUsername` helpers. Do not export these helpers unless multiple services truly share them.
- Do not put internal helpers in the namespace. The namespace is for the domain API, not a utility container.
- Split a file only once it becomes hard to read quickly. Common thresholds are schema/codec complexity, complex repository queries, or test fixtures making `index.ts` too dense.

Recommended namespace layout:

```ts
export namespace Example {
  export type Example = typeof examples.$inferSelect;

  export type Input = Input.Create | Input.Update;

  export namespace Input {
    export type Create = {
      readonly name: string;
    };

    export type Update = Partial<Create>;
  }

  export type Error = Error.NotFound;

  export namespace Error {
    export class NotFound extends Data.TaggedError("NotFound")<{
      readonly id: string;
    }> {}
  }
}
```

### Naming Rules

- Use business-oriented names for public methods, such as `getByUserId`, `getByUsername`, and `upsertForUser`.
- Use verb phrases for internal helpers, such as `validateUsername` and `ensureUsernameAvailable`.
- `Effect.fn` tracing names must match the service id suffix, such as `ProfileService.getByUsername` or `ProfileService.ensureUsernameAvailable`; avoid anonymous effects.
- Use product-friendly names for external fields. For a user's public unique identifier, use `username`; do not use platform-internal or social-media-flavored terms such as `handle`.

### Type Organization

- Prefer deriving table return types from the Drizzle schema: `typeof table.$inferSelect`.
- Put input types under the service namespace, such as `Profile.Input.Upsert`; do not export repeated-prefix types such as `ProfileUpsertInput`.
- Keep public union types in the namespace, such as `Profile.Input = Input.Upsert | Input.Update` and `Profile.Error = Error.InvalidUsername | Error.NotFound | Error.UsernameTaken`.
- Use `Partial<Omit<Upsert, "immutableField">>` for update input, but explicitly handle `undefined` in implementations so omitted fields are not written to the database.
- Put error types under the service namespace, such as `Profile.Error.NotFound`; do not export scattered top-level names like `ProfileNotFound`.
- Put the public domain error union in `Profile.Error`. Method signatures should prefer the narrow set of errors they can actually fail with; use the broader `Profile.Error` when a composite method or caller-facing handling is clearer that way.
- Do not include database errors in `Profile.Error`. When they need to appear in method signatures, use Drizzle's original typed error directly, such as `EffectDrizzleQueryError`.

### Error Handling

- Use `Data.TaggedError` for domain errors, with names that describe business facts: `NotFound`, `InvalidUsername`, `UsernameTaken`.
- Error payloads should include enough fields to identify the business fact. A single `NotFound` can accept `userId` or `username` depending on the query entrypoint; do not split it into many classes just for each lookup path.
- Do not wrap database access errors into service-specific persistence errors just for uniformity. Drizzle already provides `EffectDrizzleQueryError`, and preserving it gives callers better diagnostics.
- Create service-specific typed infrastructure errors only when the underlying error lacks structured information or when external boundary details need to be hidden.
- Return typed errors when a resource is missing; do not return `null` or `undefined`.
- Model expected conflicts explicitly, such as returning `UsernameTaken` for unique username conflicts.

### Database Access

- Inside service methods, use Effect Drizzle queries directly and return them through an Effect pipeline; use `yield*` only when a generator needs to sequence multiple steps.
- Do not add `Effect.mapError` around every query just to rename errors; keep Drizzle's original error types.
- For single-record queries, use `.limit(1)`, then use `Effect.map(Array.head)` + `Option.match` to convert an empty result into a typed `NotFound`.
- For `update(...).returning()` and `delete(...).returning()`, also take `Array.head` first and fail with `NotFound` when no row is returned.
- Use `rows[0]!` for `insert(...).returning()` / upsert only when the statement guarantees one returned row.
- Before updating a unique field, check conflicts first instead of relying only on database constraint errors to express business behavior.
- Unique-field conflict checks must allow the current owner to keep using the existing value; return business conflicts such as `UsernameTaken` only when the owner differs.
- Use `Struct.omit` to remove non-updatable fields and `Struct.pick` to whitelist updatable fields. For nullable optional fields, `upsert` should write `?? null` explicitly, while `update` should preserve `undefined` to mean "not changed".
- Schema and migration column names must match service input/output names, such as `username`, `"username"`, and `profiles_username_unique`.

### Validation And Normalization

- Put input normalization inside the service; callers should not need to know database storage rules in advance.
- Normalize unique identifiers such as usernames consistently before both writes and reads.
- Prefer file-local `Schema.asClass` codecs for reusable normalization and validation logic, such as `ProfileUsername`. Apply normalization such as `trim` / `toLowerCase` before length and format checks.
- Expose a static `decode` helper on codecs, returning an `Effect`, and use `Effect.mapError` to convert schema parse errors into domain typed errors such as `Profile.Error.InvalidUsername`.
- Return typed errors for validation failures, such as `InvalidUsername`, and keep the original input value for debugging.
- Do not put validation rules only at the API layer. The service is the domain boundary and must protect its own invariants.

### Layer Wiring

- Wire new service layers into the domain layer in `src/layers.ts`, for example `Layer.mergeAll(Profile.layer).pipe(Layer.provideMerge(Database.layer))`.
- Services that depend on the database should be provided by `Database.layer`; API handlers should not provide the database repeatedly.
- API handlers should depend only on services and should not bypass services to access the database directly.

### Verification Requirements

- After changing a service, run at least `yarn exec task server:main:typecheck`.
- When a change affects types across workspaces, run `yarn exec task typecheck`.
- After changing a Drizzle schema, run `yarn exec task server:main:db:generate` and inspect the generated migration.
- Use `yarn exec task server:main:format` for formatting.
