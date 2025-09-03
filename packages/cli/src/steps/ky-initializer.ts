import { format as prettierFormat } from "prettier";
import type { Step, StepContext, StepOutput } from "../pipeline";

export interface KyInitializerOptions {
  /**
   * Output file name
   * @default "ky-client.ts"
   */
  outputFile?: string;
}

/**
 * Step to generate ky initializer with configureClient and getKyInstance logic
 */
export function kyInitializer(options: KyInitializerOptions = {}): Step {
  return {
    name: "ky-initializer",
    outputFile: options.outputFile || "ky-client.ts",
    async process(_context: StepContext): Promise<StepOutput> {
      const clientCode = `import ky, { type Options } from 'ky';

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
    throw new Error('Client not configured. Call configureClient() first.');
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
}`;

      // Format the code
      const formattedCode = await prettierFormat(clientCode, { parser: "typescript" });

      return {
        name: "ky-initializer",
        content: formattedCode,
        meta: {
          generatedAt: new Date().toISOString(),
        },
      };
    },
  };
}
