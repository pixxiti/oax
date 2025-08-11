import { createHooks } from "@zoddy/hooks";

import { createClient, operations } from "./client";

const client = createClient("https://petstore.swagger.io/v2");

export const hooks = createHooks({
  apiName: "petstore",
  client,
  operations,
});
