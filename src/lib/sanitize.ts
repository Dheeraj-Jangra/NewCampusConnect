/**
 * HTML sanitization utilities to prevent XSS attacks.
 * Use these before injecting user content into innerHTML.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
};

/**
 * Escapes HTML special characters to prevent XSS.
 * Use this for any user-supplied text being inserted into HTML.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str).replace(/[&<>"'`/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitizes a string for safe use in HTML attributes.
 * Strips everything except alphanumeric, spaces, and basic punctuation.
 */
export function sanitizeAttr(str: string): string {
  if (!str) return '';
  return String(str).replace(/[^a-zA-Z0-9\s\-_.@]/g, '');
}

/**
 * Validates and sanitizes a URL, blocking javascript: and data: protocols.
 * Returns the URL if safe, or '#' if dangerous.
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '#';
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return '#';
  }
  return url;
}

/**
 * Sanitizes content for display in text context (escapes HTML).
 */
export function sanitizeText(str: string): string {
  return escapeHtml(str);
}
