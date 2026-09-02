'use strict';

const WEBSITE_HOSTS = new Set([
  'santiagorodriguez.com',
  'www.santiagorodriguez.com',
]);
const GITHUB_PATHS = new Set([
  '/santirodriguez/pikachu-volleyball',
  '/gorisanson/pikachu-volleyball',
]);
const MAX_URL_BYTES = 4096;

function containsUnsafeUrlByte(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f || value[index] === '\\') return true;
  }
  return false;
}

function normalizeAllowedExternalUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (Buffer.byteLength(value, 'utf8') >= MAX_URL_BYTES) return null;
  if (containsUnsafeUrlByte(value)) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== '443') return null;

  const host = parsed.hostname.toLowerCase();
  if (WEBSITE_HOSTS.has(host)) {
    return `https://${host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  if (host !== 'github.com') return null;

  const schemeSeparator = value.indexOf('://');
  const afterScheme = value.slice(schemeSeparator + 3);
  const tailIndex = afterScheme.search(/[/?#]/);
  const rawTail = tailIndex === -1 ? '' : afterScheme.slice(tailIndex);
  const queryIndex = rawTail.search(/[?#]/);
  const rawPath = queryIndex === -1 ? rawTail : rawTail.slice(0, queryIndex);
  if (!GITHUB_PATHS.has(rawPath) || parsed.pathname !== rawPath) return null;

  return `https://github.com${parsed.pathname}${parsed.search}${parsed.hash}`;
}

module.exports = Object.freeze({
  normalizeAllowedExternalUrl,
});
