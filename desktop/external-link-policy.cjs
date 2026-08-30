'use strict';

const ALLOWED_WEBSITE_HOSTS = new Set([
  'santiagorodriguez.com',
  'www.santiagorodriguez.com',
]);
const ALLOWED_GITHUB_PATHS = new Set([
  '/santirodriguez/pikachu-volleyball',
  '/gorisanson/pikachu-volleyball',
]);
const UNSAFE_RAW_URL = /[\u0000-\u0020\u007f\\]/;

function getAllowedExternalUrl(urlString) {
  if (typeof urlString !== 'string' || UNSAFE_RAW_URL.test(urlString)) return null;

  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.port && url.port !== '443') return null;

    const host = url.hostname.toLowerCase();
    if (ALLOWED_WEBSITE_HOSTS.has(host)) return url.href;
    if (host === 'github.com' && ALLOWED_GITHUB_PATHS.has(url.pathname)) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = Object.freeze({ getAllowedExternalUrl });
