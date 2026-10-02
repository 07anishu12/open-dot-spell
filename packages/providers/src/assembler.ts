import { ProviderError } from "./errors.js";

export interface AssembledToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly rawArguments: string;
  readonly arguments: Record<string, unknown>;
}

export class ToolCallStreamAssembler {
  private currentToolCallId: string | null = null;
  private currentToolName: string = "";
  private argumentChunks: string[] = [];
  private readonly completedCalls: AssembledToolCall[] = [];

  constructor(
    private readonly providerId: string = "assembler",
    private readonly modelId: string = "unknown"
  ) {}

  /**
   * Starts a new tool call assembly session for a given correlation ID.
   */
  public startToolCall(toolCallId: string, toolName: string): void {
    if (this.currentToolCallId !== null) {
      throw new ProviderError({
        message: `Cannot start tool call ${toolCallId}: previous tool call ${this.currentToolCallId} was not finalized`,
        category: "interrupted_stream",
        providerId: this.providerId,
        modelId: this.modelId,
        fatal: true
      });
    }

    this.currentToolCallId = toolCallId;
    this.currentToolName = toolName;
    this.argumentChunks = [];
  }

  /**
   * Appends an incremental argument chunk to the active tool call.
   */
  public appendDelta(toolCallId: string, argumentsDelta: string): void {
    if (this.currentToolCallId === null) {
      throw new ProviderError({
        message: `Received tool argument delta for ${toolCallId} without an active tool call`,
        category: "malformed_response",
        providerId: this.providerId,
        modelId: this.modelId,
        fatal: true
      });
    }

    if (this.currentToolCallId !== toolCallId) {
      throw new ProviderError({
        message: `Mismatched toolCallId in stream: expected ${this.currentToolCallId}, received ${toolCallId}`,
        category: "malformed_response",
        providerId: this.providerId,
        modelId: this.modelId,
        fatal: true
      });
    }

    this.argumentChunks.push(argumentsDelta);
  }

  /**
   * Finalizes the active tool call by parsing the accumulated argument chunks.
   * Enforces strict JSON syntax without silent repair.
   */
  public finalizeToolCall(toolCallId: string): AssembledToolCall {
    if (this.currentToolCallId === null || this.currentToolCallId !== toolCallId) {
      throw new ProviderError({
        message: `Cannot finalize tool call ${toolCallId}: no matching active tool call session`,
        category: "malformed_response",
        providerId: this.providerId,
        modelId: this.modelId,
        fatal: true
      });
    }

    const raw = this.argumentChunks.join("");
    let parsed: unknown;

    try {
      parsed = raw.trim() === "" ? {} : JSON.parse(raw);
    } catch (err) {
      // Must produce a structured error rather than silently repairing via string manipulation
      throw new ProviderError({
        message: `Malformed JSON in tool call arguments for ${this.currentToolName}: ${err instanceof Error ? err.message : String(err)}`,
        category: "malformed_response",
        providerId: this.providerId,
        modelId: this.modelId,
        fatal: true,
        rawError: raw
      });
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new ProviderError({
        message: `Tool call arguments must evaluate to a JSON object, received ${Array.isArray(parsed) ? "array" : typeof parsed}`,
        category: "malformed_response",
        providerId: this.providerId,
        modelId: this.modelId,
        fatal: true,
        rawError: raw
      });
    }

    const assembled: AssembledToolCall = {
      toolCallId,
      toolName: this.currentToolName,
      rawArguments: raw,
      arguments: parsed as Record<string, unknown>
    };

    this.completedCalls.push(assembled);
    this.currentToolCallId = null;
    this.currentToolName = "";
    this.argumentChunks = [];

    return assembled;
  }

  /**
   * Indicates whether a tool call stream is currently incomplete.
   */
  public hasPendingToolCall(): boolean {
    return this.currentToolCallId !== null;
  }

  /**
   * Asserts that no stream was abruptly cut off mid-tool-call.
   */
  public assertStreamComplete(): void {
    if (this.currentToolCallId !== null) {
      throw new ProviderError({
        message: `Stream ended prematurely while receiving tool call ${this.currentToolCallId}`,
        category: "interrupted_stream",
        providerId: this.providerId,
        modelId: this.modelId,
        fatal: true
      });
    }
  }

  public getCompletedCalls(): readonly AssembledToolCall[] {
    return this.completedCalls;
  }
}
