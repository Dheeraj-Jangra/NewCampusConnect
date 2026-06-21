export const API_BASE: string =
  (import.meta as unknown as { env: Record<string, string> }).env
    .PUBLIC_API_URL || window.location.origin;

export const SOCKET_URL: string =
  (import.meta as unknown as { env: Record<string, string> }).env
    .PUBLIC_SOCKET_URL || window.location.origin;
