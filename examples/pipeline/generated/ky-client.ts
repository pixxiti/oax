// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2026-04-14T00:09:53.137Z

import ky, { type Options } from "ky";

export interface KyClientOptions extends Options {
  baseUrl: string;
}

let clientOptions: KyClientOptions | undefined;
let kyInstance: typeof ky | undefined;

export function configureClient(options: KyClientOptions) {
  clientOptions = options;
  // Reset instance so it gets recreated with new options
  kyInstance = undefined;
}

export function getKyInstance(): typeof ky {
  if (!clientOptions) {
    throw new Error("Client not configured. Call configureClient() first.");
  }

  if (!kyInstance) {
    kyInstance = ky.create(clientOptions);
  }

  return kyInstance;
}

export function resetKyInstance() {
  kyInstance = undefined;
}
