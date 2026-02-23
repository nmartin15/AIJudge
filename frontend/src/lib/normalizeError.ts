import { ApiClientError } from "@/lib/api";

export function normalizeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const backendCode = error.backendCode ? ` [${error.backendCode}]` : "";
    if (error.message) return `${error.message}${backendCode}`;
    return (
      error.details ||
      `Backend request failed (${error.status ?? error.code})${backendCode}.`
    );
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
