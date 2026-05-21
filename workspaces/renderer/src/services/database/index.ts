import { Context, Effect, Layer } from "effect";
import { RendererConfig } from "../../config";
import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";

import * as schema from "./schema";

export { schema };

export class Database extends Context.Service<Database>()("renderer/services/database/index/Database", {
  make: Effect.fn("Database.make")(function* () {
    const config = yield* RendererConfig;

    return yield* PgDrizzle.makeWithDefaults().pipe(Effect.provide(PgClient.layer({ url: config.database.url })));
  }),
}) {
  public static readonly layer = Layer.effect(Database, Database.make());
}
