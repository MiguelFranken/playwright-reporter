import { createHash } from 'node:crypto';

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;

/**
 * Normalizes an error message so that the same failure with different volatile parts
 * (durations, ids, paths, numbers, quoted strings) groups together.
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .replace(ANSI, '')
    .split('\n')
    .slice(0, 3)
    .join(' ')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/(?:\/[\w.-]+)+\.\w+(?::\d+(?::\d+)?)?/g, '<path>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hex>')
    .replace(/\b\d+(?:\.\d+)?\s*(ms|s|m)\b/gi, '<duration>')
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '<str>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 300);
}

export function errorSignature(message: string | undefined | null): string | null {
  if (!message) return null;
  const normalized = normalizeErrorMessage(message);
  if (!normalized) return null;
  return createHash('sha1').update(normalized).digest('hex');
}

export function firstLine(message: string | undefined | null): string | null {
  if (!message) return null;
  return message.replace(ANSI, '').split('\n')[0].trim().slice(0, 500) || null;
}
