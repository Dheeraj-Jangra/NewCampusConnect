/// <reference types="astro/client" />

export const API_BASE: string =
  import.meta.env.PUBLIC_API_URL || window.location.origin;

export const SOCKET_URL: string =
  import.meta.env.PUBLIC_SOCKET_URL || window.location.origin;
