import { invoke } from "@tauri-apps/api/core";

/**
 * The webview console is not forwarded to the terminal on Windows, so playback
 * traces go through the backend instead. Failures here are ignored on purpose:
 * diagnostics must never break the thing they are diagnosing.
 */
export function logDiagnostic(scope: string, message: string): void {
  console.info(`[${scope}] ${message}`);
  void invoke("log_diagnostic", { scope, message }).catch(() => {});
}
