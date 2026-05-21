import { Schema } from "effect";
import * as Multipart from "effect/unstable/http/Multipart";
import { HttpApiSchema } from "effect/unstable/httpapi";

export namespace Interfaces {
  export const PositiveInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));
  export const UUIDv7 = Schema.NonEmptyString.pipe(Schema.check(Schema.isUUID(7)));

  export const RenderConstraints = Schema.Struct({
    resolution: Schema.Struct({
      width: PositiveInt,
      height: PositiveInt,
    }),
    framerate: PositiveInt,
    bitrate: PositiveInt,
  });
  export type RenderConstraints = typeof RenderConstraints.Type;

  export const RenderCreatePayload = Schema.Struct({
    input: Multipart.SingleFileSchema,
    constraints: Schema.fromJsonString(RenderConstraints),
  }).pipe(HttpApiSchema.asMultipart());

  export const RenderSourcePayload = Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/x-python" }));

  export const RenderLogChannel = Schema.Literals(["stdout", "stderr"]);

  export const RenderLogPayload = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "text/plain" }));

  export const RenderOutputPayload = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "video/mp4" }));

  export const NonNegativeInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));

  export const RenderFinish = Schema.Struct({
    status: Schema.Literals(["failed", "succeed"]),
    exitCode: NonNegativeInt,
    details: Schema.optionalKey(Schema.String),
  });

  export const RenderJobOutput = { stdout: Schema.String, stderr: Schema.String };
}
