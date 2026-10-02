import { z } from "zod";

export const ToolRiskClassSchema = z.enum([
  "pure",
  "read_only",
  "low_risk",
  "high_risk",
  "critical"
]);
export type ToolRiskClass = z.infer<typeof ToolRiskClassSchema>;

export const ToolVerificationMethodSchema = z.enum([
  "deterministic",
  "schema_only",
  "human_approval",
  "sandbox_verification"
]);
export type ToolVerificationMethod = z.infer<typeof ToolVerificationMethodSchema>;

export const ToolSideEffectClassificationSchema = z.enum([
  "none",
  "read_workspace",
  "write_workspace",
  "isolated_execution",
  "external_network"
]);
export type ToolSideEffectClassification = z.infer<typeof ToolSideEffectClassificationSchema>;

export interface ToolExecutionContext {
  workspaceId: string;
  runId: string;
  toolCallId: string;
  signal?: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly riskClass: ToolRiskClass;
  readonly requiredPermissions: readonly string[];
  readonly timeout: number; // Execution timeout in milliseconds
  readonly verificationMethod: ToolVerificationMethod;
  readonly sideEffectClassification: ToolSideEffectClassification;
  readonly execute: (args: TInput, context: ToolExecutionContext) => Promise<TOutput>;
}

// ==========================================
// Initial Safe Pure Tools (Step 11)
// ==========================================

export const TestEchoInputSchema = z
  .object({
    message: z.string().min(1, "message must not be empty").max(4096, "message exceeds 4096 characters")
  })
  .strict();
export type TestEchoInput = z.infer<typeof TestEchoInputSchema>;

export const TestEchoOutputSchema = z
  .object({
    echo: z.string(),
    receivedAt: z.string()
  })
  .strict();
export type TestEchoOutput = z.infer<typeof TestEchoOutputSchema>;

/**
 * Harmless synthetic test tool.
 * Bounded pure string echo with timestamp. No filesystem or network access.
 */
export const testEchoTool: ToolDefinition<TestEchoInput, TestEchoOutput> = {
  name: "test_echo",
  version: "1.0.0",
  description: "Harmless synthetic test tool that returns an echo of the supplied message.",
  inputSchema: TestEchoInputSchema,
  outputSchema: TestEchoOutputSchema,
  riskClass: "pure",
  requiredPermissions: [],
  timeout: 5000,
  verificationMethod: "deterministic",
  sideEffectClassification: "none",
  execute: async (args) => {
    return {
      echo: args.message,
      receivedAt: new Date().toISOString()
    };
  }
};

export const FormatTextInputSchema = z
  .object({
    text: z.string().max(32768, "text exceeds 32KB limit"),
    operation: z.enum([
      "uppercase",
      "lowercase",
      "trim",
      "json_pretty",
      "sort_lines",
      "word_count"
    ])
  })
  .strict();
export type FormatTextInput = z.infer<typeof FormatTextInputSchema>;

export const FormatTextOutputSchema = z
  .object({
    formatted: z.string(),
    characterCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative()
  })
  .strict();
export type FormatTextOutput = z.infer<typeof FormatTextOutputSchema>;

/**
 * Useful pure tool for formatting text.
 * Strictly in-memory deterministic transformation. No filesystem or network access.
 */
export const formatTextTool: ToolDefinition<FormatTextInput, FormatTextOutput> = {
  name: "format_text",
  version: "1.0.0",
  description: "Pure in-memory text transformation tool (uppercase, lowercase, trim, json_pretty, sort_lines, word_count).",
  inputSchema: FormatTextInputSchema,
  outputSchema: FormatTextOutputSchema,
  riskClass: "pure",
  requiredPermissions: [],
  timeout: 5000,
  verificationMethod: "deterministic",
  sideEffectClassification: "none",
  execute: async (args) => {
    let formatted = "";
    switch (args.operation) {
      case "uppercase":
        formatted = args.text.toUpperCase();
        break;
      case "lowercase":
        formatted = args.text.toLowerCase();
        break;
      case "trim":
        formatted = args.text.trim();
        break;
      case "json_pretty": {
        try {
          const parsed = JSON.parse(args.text);
          formatted = JSON.stringify(parsed, null, 2);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`JSON pretty formatting failed: ${msg}`);
        }
        break;
      }
      case "sort_lines":
        formatted = args.text.split("\n").sort().join("\n");
        break;
      case "word_count":
        formatted = args.text;
        break;
    }

    const trimmed = args.text.trim();
    const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

    return {
      formatted,
      characterCount: formatted.length,
      wordCount: words
    };
  }
};

// ==========================================
// Tool Registry
// ==========================================

export interface ToolSummary {
  name: string;
  version: string;
  description: string;
  riskClass: ToolRiskClass;
  sideEffectClassification: ToolSideEffectClassification;
  timeout: number;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /**
   * Registers a versioned tool.
   * Throws if name + version collision occurs.
   */
  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    const versionedKey = `${tool.name}@${tool.version}`;
    if (this.tools.has(versionedKey)) {
      throw new Error(`Tool already registered: ${versionedKey}`);
    }
    this.tools.set(versionedKey, tool as unknown as ToolDefinition);
    // Point toolName@latest to the registered tool (or most recent registered)
    this.tools.set(`${tool.name}@latest`, tool as unknown as ToolDefinition);
  }

  /**
   * Retrieves a tool by name and optional version (defaults to latest).
   */
  get(name: string, version?: string): ToolDefinition | undefined {
    if (version) {
      return this.tools.get(`${name}@${version}`);
    }
    return this.tools.get(`${name}@latest`);
  }

  has(name: string, version?: string): boolean {
    return this.get(name, version) !== undefined;
  }

  /**
   * Lists all unique registered tools.
   */
  list(): ToolSummary[] {
    const result: ToolSummary[] = [];
    const seen = new Set<string>();

    for (const [key, tool] of this.tools.entries()) {
      if (key.endsWith("@latest")) continue;
      if (!seen.has(tool.name)) {
        seen.add(tool.name);
        result.push({
          name: tool.name,
          version: tool.version,
          description: tool.description,
          riskClass: tool.riskClass,
          sideEffectClassification: tool.sideEffectClassification,
          timeout: tool.timeout
        });
      }
    }

    return result;
  }
}

/**
 * Factory creating default ToolRegistry pre-populated with safe initial tools.
 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(testEchoTool);
  registry.register(formatTextTool);
  return registry;
}
