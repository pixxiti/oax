// This file is auto-generated using oax. Do not edit manually.
// Generated on: 2025-09-03T16:32:03.326Z

import ky, { type Options } from "ky";

export interface KyClientOptions extends Options {
  baseUrl: string;
  prefixUrl?: string;
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
    const { baseUrl, prefixUrl, ...restOptions } = clientOptions;
    kyInstance = ky.create({
      prefixUrl: prefixUrl || baseUrl,
      ...restOptions,
    });
  }

  return kyInstance;
}

export function resetKyInstance() {
  kyInstance = undefined;
}
