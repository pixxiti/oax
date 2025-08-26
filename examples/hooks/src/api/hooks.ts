import { createHooks } from "@oax/hooks";

import { createClient } from "./client";

const client = createClient("https://petstore3.swagger.io/api/v3/");

export const hooks = createHooks({
  apiName: "petstore",
  client,
});
