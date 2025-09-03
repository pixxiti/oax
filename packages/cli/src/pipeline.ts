import * as path from "path";
import * as fs from "fs/promises";

export interface StepInput {
  name: string;
  content: any;
  meta?: Record<string, any>;
}

export interface StepOutput {
  name: string;
  content: any;
  meta?: Record<string, any>;
}

export interface StepContext {
  inputs: Record<string, StepInput>;
  outputDir: string;
  previousOutputs: Record<string, StepOutput>;
}

export interface Step {
  name: string;
  input?: string;
  outputFile?: string;
  process(context: StepContext): Promise<StepOutput>;
}

export interface PipelineConfig {
  outputDir?: string;
  input?: string;
  steps: Step[];
}

export class Pipeline {
  private config: PipelineConfig;
  private outputs: Record<string, StepOutput> = {};

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  private addAutogenerationComment(content: string, fileExt: string): string {
    const commentInfo = this.getCommentForFileType(fileExt);
    if (!commentInfo) return content;
    
    const { start, end } = commentInfo;
    const timestamp = new Date().toISOString();
    
    if (end) {
      // Multi-line comment style (CSS, HTML, etc.)
      return `${start} This file is auto-generated using oax. Do not edit manually.\n     Generated on: ${timestamp} ${end}\n\n${content}`;
    }
    // Single-line comment style
    return `${start} This file is auto-generated using oax. Do not edit manually.\n${start} Generated on: ${timestamp}\n\n${content}`;
  }

  private getCommentForFileType(ext: string): { start: string; end?: string } | null {
    const commentMap: Record<string, { start: string; end?: string }> = {
      '.js': { start: '//' },
      '.ts': { start: '//' },
      '.jsx': { start: '//' },
      '.tsx': { start: '//' },
      '.py': { start: '#' },
      '.sh': { start: '#' },
      '.bash': { start: '#' },
      '.yaml': { start: '#' },
      '.yml': { start: '#' },
      '.toml': { start: '#' },
      '.ini': { start: '#' },
      '.conf': { start: '#' },
      '.css': { start: '/*', end: '*/' },
      '.scss': { start: '//' },
      '.sass': { start: '//' },
      '.less': { start: '//' },
      '.html': { start: '<!--', end: '-->' },
      '.xml': { start: '<!--', end: '-->' },
      '.sql': { start: '--' },
      '.rs': { start: '//' },
      '.go': { start: '//' },
      '.java': { start: '//' },
      '.c': { start: '//' },
      '.cpp': { start: '//' },
      '.h': { start: '//' },
      '.hpp': { start: '//' },
      '.cs': { start: '//' },
      '.php': { start: '//' },
      '.rb': { start: '#' },
      '.pl': { start: '#' },
      '.r': { start: '#' },
      '.lua': { start: '--' },
      '.vim': { start: '"' },
      '.dockerfile': { start: '#' },
      '.gitignore': { start: '#' },
      '.env': { start: '#' }
    };

    return commentMap[ext] || null;
  }

  async run(): Promise<void> {
    const outputDir = path.resolve(process.cwd(), this.config.outputDir || "oax");

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Load initial input if specified
    const inputs: Record<string, StepInput> = {};
    if (this.config.input) {
      const inputPath = path.resolve(process.cwd(), this.config.input);
      const inputContent = await fs.readFile(inputPath, "utf-8");
      inputs[this.config.input] = {
        name: this.config.input,
        content: JSON.parse(inputContent), // Assume JSON for now
      };
    }

    console.log(`🚀 Running pipeline with ${this.config.steps.length} steps...`);

    for (const [index, step] of Array.from(this.config.steps.entries())) {
      console.log(`📋 Step ${index + 1}/${this.config.steps.length}: ${step.name}`);

      const context: StepContext = {
        inputs,
        outputDir,
        previousOutputs: this.outputs,
      };

      try {
        const output = await step.process(context);
        this.outputs[step.name] = output;

        // Write output to file only if outputFile is specified
        if (step.outputFile) {
          const outputPath = path.join(outputDir, step.outputFile);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });

          // Add autogeneration comment based on file extension
          const ext = path.extname(step.outputFile).toLowerCase();
          let content: string;
          
          if (typeof output.content === "string") {
            content = this.addAutogenerationComment(output.content, ext);
          } else {
            content = this.addAutogenerationComment(JSON.stringify(output.content, null, 2), ext);
          }

          await fs.writeFile(outputPath, content);

          console.log(`✅ Step completed: ${step.name} → ${step.outputFile}`);
        } else {
          console.log(`✅ Step completed: ${step.name} (context only)`);
        }
      } catch (error) {
        console.error(`❌ Step failed: ${step.name}`, error);
        throw error;
      }
    }

    console.log(`🎉 Pipeline completed successfully! Output in: ${outputDir}`);
  }
}

export async function loadPipelineConfig(configPath = "oax.config.ts"): Promise<PipelineConfig> {
  const fullPath = path.resolve(process.cwd(), configPath);

  try {
    // First check if the file exists
    await fs.access(fullPath);

    // For both .ts and .js files, use dynamic import
    // tsx should handle TypeScript files automatically when it's running
    const module = await import(fullPath);
    const config: PipelineConfig = module.default || module;

    if (!config || !config.steps) {
      throw new Error(
        `Invalid config format. Config must export a default configuration with 'steps' array.`
      );
    }

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to load pipeline config from ${configPath}: ${error}`);
  }
}
