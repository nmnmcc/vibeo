import { HttpRouter } from "effect/unstable/http";
import { serve } from "srvx";
import { AppLayer } from "./layers";

const { handler, dispose } = HttpRouter.toWebHandler(AppLayer);

export default serve({
  fetch: handler,
});

process.on("exit", dispose);
