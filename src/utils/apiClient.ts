/**
 * Centralised API client for all Supabase edge-function calls.
 */

import { isFigmaSandbox } from "./sandbox";

/** Thrown when a network call is attempted inside Figma's preview. */
export class SandboxNetworkError extends Error {
  readonly isSandboxError = true;
  constructor() {
    super(
      "Network requests are blocked in Figma's preview sandbox. " +
      "Open the published app URL in a browser tab to use this feature."
    );
    this.name = "SandboxNetworkError";
  }
}

/**
 * Fetch wrapper used for ALL server calls.
 * – Calls isFigmaSandbox() fresh (never cached) before firing fetch().
 * – Auto-cancels after `ms` milliseconds.
 */
export async function apiFetch(
  input: RequestInfo,
  init: RequestInit = {},
  ms = 90_000
): Promise<Response> {
  if (isFigmaSandbox()) {
    throw new SandboxNetworkError();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. The server may be cold-starting — please try again.");
    }
    throw err;
  }
}

/** Returns true when the error came from the Figma sandbox guard. */
export function isSandboxError(err: unknown): err is SandboxNetworkError {
  return err instanceof SandboxNetworkError || (err as any)?.isSandboxError === true;
}
