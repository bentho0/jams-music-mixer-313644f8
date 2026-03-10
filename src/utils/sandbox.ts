/**
 * Sandbox detection — simplified for Lovable (non-Figma environment).
 * All sandbox checks return false since we're running in Lovable's preview.
 */

export function detectSandbox(): boolean {
  return false;
}

export function isFigmaSandbox(): boolean {
  return false;
}

export const IS_FIGMA_SANDBOX = false;
