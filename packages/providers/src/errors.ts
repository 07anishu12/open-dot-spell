import { redactSensitiveData } from "@open-dot-spell/core";
import type { ProviderErrorCategory } from "./types.js";

export interface ProviderErrorParams {
  message: string;
  category: ProviderErrorCategory;
  providerId: string;
  modelId: string;
  fatal?: boolean;
  rawError?: unknown;
}

export class ProviderError extends Error {
  public readonly category: ProviderErrorCategory;
  public readonly providerId: string;
  public readonly modelId: string;
  public readonly fatal: boolean;
  public readonly rawError?: unknown;

  constructor(params: ProviderErrorParams) {
    // Redact any potential credentials, tokens, or keys from the message
    const sanitizedMsg = String(redactSensitiveData(params.message));
    super(`[${params.providerId}:${params.category}] ${sanitizedMsg}`);
    this.name = "ProviderError";
    this.category = params.category;
    this.providerId = params.providerId;
    this.modelId = params.modelId;
    this.fatal = params.fatal ?? false;
    this.rawError = params.rawError ? redactSensitiveData(params.rawError) : undefined;
  }
}
