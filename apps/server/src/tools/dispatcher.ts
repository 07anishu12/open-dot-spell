import {
  type ToolRegistry,
  computeActionFingerprint,
  type RunEventBus
} from "@open-dot-spell/core";
import {
  type DatabaseInstance,
  verifyWorkspaceScope,
  getRun
} from "@open-dot-spell/db";

export type ToolDispatchErrorCode =
  | "UNAUTHORIZED_WORKSPACE"
  | "INVALID_RUN_SCOPE"
  | "RUN_NOT_ACTIVE"
  | "UNKNOWN_TOOL"
  | "POLICY_VIOLATION"
  | "MALFORMED_ARGUMENTS"
  | "MISSING_ARGUMENTS"
  | "PROHIBITED_FIELDS"
  | "INVALID_OUTPUT"
  | "OVERSIZED_OUTPUT"
  | "EXECUTION_TIMEOUT"
  | "EXECUTION_FAILED";

export interface ToolDispatchRequest {
  workspaceId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  toolVersion?: string;
  rawArguments: unknown;
  targetResource?: string;
}

export interface ToolDispatchSuccess {
  success: true;
  toolCallId: string;
  toolName: string;
  toolVersion?: string;
  output: unknown;
  durationMs: number;
  fingerprint: string;
}

export interface ToolDispatchFailure {
  success: false;
  toolCallId: string;
  toolName: string;
  toolVersion?: string;
  error: {
    code: ToolDispatchErrorCode;
    message: string;
    details?: string;
  };
  durationMs: number;
  fingerprint?: string;
}

export type ToolDispatchResponse = ToolDispatchSuccess | ToolDispatchFailure;

export interface IToolPersistence {
  verifyWorkspaceScope(resourceType: "run", resourceId: string, workspaceId: string): Promise<boolean>;
  getRun(runId: string): Promise<{ id: string; workspaceId: string; status: string } | null>;
  recordRunEvent(event: {
    runId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<{ sequenceNumber: number }>;
}

export const MAX_TOOL_OUTPUT_BYTES = 65536; // 64 KB output budget
export const MAX_ERROR_STRING_LENGTH = 500;

export function createDatabaseToolPersistence(db: DatabaseInstance): IToolPersistence {
  return {
    async verifyWorkspaceScope(resourceType, resourceId, workspaceId) {
      return verifyWorkspaceScope(db.client, resourceType, resourceId, workspaceId);
    },
    async getRun(runId) {
      const run = await getRun(db.client, runId);
      if (!run) return null;
      return {
        id: run.id,
        workspaceId: run.workspaceId,
        status: run.status
      };
    },
    async recordRunEvent({ runId, eventType, payload }) {
      const seqRes = await db.client.execute({
        sql: "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM run_events WHERE run_id = ?;",
        args: [runId]
      });
      const sequenceNumber = Number(seqRes.rows[0]["next_seq"]);
      const now = new Date().toISOString();
      await db.client.execute({
        sql: `INSERT INTO run_events (run_id, sequence_number, event_type, payload, created_at)
              VALUES (?, ?, ?, ?, ?);`,
        args: [runId, sequenceNumber, eventType, JSON.stringify(payload), now]
      });
      return { sequenceNumber };
    }
  };
}

export interface ToolDispatcherOptions {
  registry: ToolRegistry;
  db?: DatabaseInstance;
  persistence?: IToolPersistence;
  eventBus?: RunEventBus;
  maxOutputBytes?: number;
}

export class ToolDispatcher {
  private registry: ToolRegistry;
  private persistence: IToolPersistence;
  private eventBus?: RunEventBus;
  private maxOutputBytes: number;

  constructor(options: ToolDispatcherOptions) {
    this.registry = options.registry;
    this.eventBus = options.eventBus;
    this.maxOutputBytes = options.maxOutputBytes ?? MAX_TOOL_OUTPUT_BYTES;

    if (options.persistence) {
      this.persistence = options.persistence;
    } else if (options.db) {
      this.persistence = createDatabaseToolPersistence(options.db);
    } else {
      throw new Error("ToolDispatcher requires either persistence or db option");
    }
  }

  /**
   * Dispatches a tool request across the single server-side authorization boundary.
   */
  async dispatch(req: ToolDispatchRequest): Promise<ToolDispatchResponse> {
    const startTime = Date.now();
    const { workspaceId, runId, toolCallId, toolName, toolVersion, rawArguments, targetResource } = req;

    // 1. Authorize Workspace and Run Scope
    if (!workspaceId || typeof workspaceId !== "string" || !runId || typeof runId !== "string") {
      return {
        success: false,
        toolCallId,
        toolName,
        error: {
          code: "UNAUTHORIZED_WORKSPACE",
          message: "Valid workspaceId and runId are strictly required"
        },
        durationMs: Date.now() - startTime
      };
    }

    const run = await this.persistence.getRun(runId);
    if (!run) {
      return {
        success: false,
        toolCallId,
        toolName,
        error: {
          code: "INVALID_RUN_SCOPE",
          message: `Run '${runId}' was not found in persistence`
        },
        durationMs: Date.now() - startTime
      };
    }

    const isScopeValid = await this.persistence.verifyWorkspaceScope("run", runId, workspaceId);
    if (!isScopeValid || run.workspaceId !== workspaceId) {
      return {
        success: false,
        toolCallId,
        toolName,
        error: {
          code: "UNAUTHORIZED_WORKSPACE",
          message: `Run '${runId}' is not authorized for workspace '${workspaceId}'`
        },
        durationMs: Date.now() - startTime
      };
    }

    if (run.status === "cancelled" || run.status === "failed" || run.status === "interrupted" || run.status === "succeeded") {
      return {
        success: false,
        toolCallId,
        toolName,
        error: {
          code: "RUN_NOT_ACTIVE",
          message: `Run '${runId}' is in terminal status '${run.status}' and cannot execute tool calls`
        },
        durationMs: Date.now() - startTime
      };
    }

    // 2. Resolve Tool from Registry
    const tool = this.registry.get(toolName, toolVersion);
    if (!tool) {
      return {
        success: false,
        toolCallId,
        toolName,
        error: {
          code: "UNKNOWN_TOOL",
          message: `Unknown or unregistered tool: '${toolName}'${toolVersion ? `@${toolVersion}` : ""}`
        },
        durationMs: Date.now() - startTime
      };
    }

    // 3. Step 11 Policy Gate: only explicitly safe pure tools allowed
    if (tool.riskClass !== "pure" || tool.sideEffectClassification !== "none") {
      return {
        success: false,
        toolCallId,
        toolName,
        error: {
          code: "POLICY_VIOLATION",
          message: `Tool '${tool.name}' is classified as '${tool.riskClass}' with side-effects '${tool.sideEffectClassification}'. Only pure tools are permitted before Step 12.`
        },
        durationMs: Date.now() - startTime
      };
    }

    // 4. Validate Arguments against Schema (Model-generated JSON is untrusted input)
    let parsedArguments: unknown;
    if (typeof rawArguments === "string") {
      try {
        parsedArguments = JSON.parse(rawArguments);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          toolCallId,
          toolName,
          error: {
            code: "MALFORMED_ARGUMENTS",
            message: "Failed to parse tool arguments as valid JSON",
            details: msg.slice(0, MAX_ERROR_STRING_LENGTH)
          },
          durationMs: Date.now() - startTime
        };
      }
    } else {
      parsedArguments = rawArguments;
    }

    if (parsedArguments === null || typeof parsedArguments !== "object") {
      return {
        success: false,
        toolCallId,
        toolName,
        error: {
          code: "MALFORMED_ARGUMENTS",
          message: "Tool arguments must be a structured JSON object"
        },
        durationMs: Date.now() - startTime
      };
    }

    const argParseResult = tool.inputSchema.safeParse(parsedArguments);
    if (!argParseResult.success) {
      const issues = argParseResult.error.issues;
      const hasUnrecognized = issues.some((i) => i.code === "unrecognized_keys");
      const hasMissing = issues.some(
        (i) => i.code === "invalid_type" && (i as { received?: string }).received === "undefined"
      );

      const errorCode: ToolDispatchErrorCode = hasUnrecognized
        ? "PROHIBITED_FIELDS"
        : hasMissing
          ? "MISSING_ARGUMENTS"
          : "MALFORMED_ARGUMENTS";

      const details = issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");

      return {
        success: false,
        toolCallId,
        toolName,
        error: {
          code: errorCode,
          message: "Arguments failed schema validation",
          details: details.slice(0, MAX_ERROR_STRING_LENGTH)
        },
        durationMs: Date.now() - startTime
      };
    }

    const validatedArgs = argParseResult.data;
    const fingerprint = computeActionFingerprint(
      tool.name,
      validatedArgs as Record<string, unknown>,
      targetResource ?? "none"
    );

    // 5. Record Prepared Event in Run Event Ledger
    const preparedPayload: Record<string, unknown> = {
      toolCallId,
      toolName: tool.name,
      toolVersion: tool.version,
      fingerprint,
      actionFingerprint: fingerprint,
      arguments: validatedArgs,
      riskClass: tool.riskClass,
      sideEffectClassification: tool.sideEffectClassification,
      status: "prepared"
    };

    const preparedEvent = await this.persistence.recordRunEvent({
      runId,
      eventType: "tool_call_prepared",
      payload: preparedPayload
    });

    if (this.eventBus) {
      this.eventBus.emit({
        id: preparedEvent.sequenceNumber,
        runId,
        sequenceNumber: preparedEvent.sequenceNumber,
        eventType: "tool_call_prepared",
        payload: preparedPayload,
        createdAt: new Date().toISOString()
      });
    }

    // 6. Execute Tool with Timeout Budget
    const controller = new AbortController();
    const timeoutBudget = Math.max(100, Math.min(tool.timeout, 30000));
    let timeoutTimer: NodeJS.Timeout | null = null;

    let toolOutput: unknown;
    let executionError: { code: ToolDispatchErrorCode; message: string; details?: string } | null = null;

    try {
      const executePromise = tool.execute(validatedArgs, {
        workspaceId,
        runId,
        toolCallId,
        signal: controller.signal
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Tool execution timed out after ${timeoutBudget}ms`));
        }, timeoutBudget);
      });

      toolOutput = await Promise.race([executePromise, timeoutPromise]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (controller.signal.aborted || message.includes("timed out")) {
        executionError = {
          code: "EXECUTION_TIMEOUT",
          message: `Tool execution timed out after ${timeoutBudget}ms`
        };
      } else {
        executionError = {
          code: "EXECUTION_FAILED",
          message: "Tool execution threw an uncaught error",
          details: message.slice(0, MAX_ERROR_STRING_LENGTH)
        };
      }
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }

    const durationMs = Date.now() - startTime;

    // 7. Validate Output & Output Size Limit (if execution succeeded)
    if (!executionError) {
      const outputParseResult = tool.outputSchema.safeParse(toolOutput);
      if (!outputParseResult.success) {
        const issues = outputParseResult.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
        executionError = {
          code: "INVALID_OUTPUT",
          message: "Tool handler returned data violating output schema",
          details: issues.slice(0, MAX_ERROR_STRING_LENGTH)
        };
      } else {
        toolOutput = outputParseResult.data;
        const serialized = JSON.stringify(toolOutput);
        if (serialized.length > this.maxOutputBytes) {
          executionError = {
            code: "OVERSIZED_OUTPUT",
            message: `Tool output exceeds size limit of ${this.maxOutputBytes} bytes (${serialized.length} bytes)`
          };
        }
      }
    }

    // 8. Record Result Event in Run Event Ledger
    const resultPayload: Record<string, unknown> = {
      toolCallId,
      toolName: tool.name,
      toolVersion: tool.version,
      fingerprint,
      actionFingerprint: fingerprint,
      durationMs,
      success: !executionError,
      status: executionError ? "failed" : "succeeded",
      ...(executionError ? { error: executionError } : { output: toolOutput })
    };

    const resultEvent = await this.persistence.recordRunEvent({
      runId,
      eventType: "tool_call_result",
      payload: resultPayload
    });

    if (this.eventBus) {
      this.eventBus.emit({
        id: resultEvent.sequenceNumber,
        runId,
        sequenceNumber: resultEvent.sequenceNumber,
        eventType: "tool_call_result",
        payload: resultPayload,
        createdAt: new Date().toISOString()
      });
    }

    // 9. Return Bounded Structured Response
    if (executionError) {
      return {
        success: false,
        toolCallId,
        toolName: tool.name,
        toolVersion: tool.version,
        error: executionError,
        durationMs,
        fingerprint
      };
    }

    return {
      success: true,
      toolCallId,
      toolName: tool.name,
      toolVersion: tool.version,
      output: toolOutput,
      durationMs,
      fingerprint
    };
  }
}
