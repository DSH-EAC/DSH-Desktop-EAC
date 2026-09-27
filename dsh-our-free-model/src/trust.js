/**
 * Request trust fence for the plugin's HTTP surface.
 *
 * The plugin registers a prefix *longer* than the kernel's `/api`, and webServer
 * dispatch is longest-prefix-wins — so these routes run before the connection
 * service's own admission check and would otherwise answer any loopback caller.
 * That was measured and documented as an open boundary; this module closes it.
 *
 * Two layers, tried in order:
 *
 * 1. the composition's own `connection` service when present — the exact
 *    admission decision the kernel applies to its `/api` routes (trust fence
 *    plus browser-auth cookie), so the plugin is never weaker than the app;
 * 2. a structural replica of that fence for compositions without the service:
 *    loopback host only, no cross-site fetches, and an `Origin`/`Referer` that
 *    matches the `Host` authority whenever the client supplies one.
 *
 * @module src/trust.js
 */

/** Hostnames a same-machine caller can legitimately use. */
const LOOPBACK_NAMES = new Set(['127.0.0.1', '[::1]', '::1', 'localhost'])

/**
 * Is this address one a same-machine caller can reach — i.e. may the forward
 * listener bind it? The lanes are keyed to this machine's egress and priced
 * against whoever shares it, so binding a routable interface would hand the
 * quota to the whole subnet on the strength of a string in a settings file.
 */
export function isLoopbackHost(value) {
  const authority = authorityOf(String(value ?? ''), 'http')
  return authority !== null && LOOPBACK_NAMES.has(authority.hostname)
}

/**
 * Decide one request. Returns an HTTP status to reject with, or `undefined` to
 * let the handler run.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {object|undefined} connection - the harness `connection` service, when the composition mounts one
 * @returns {number|undefined}
 */
export function rejectionFor(req, connection) {
  if (connection && typeof connection.admit === 'function') {
    try {
      const admission = connection.admit(req)
      if (admission && typeof admission === 'object' && 'rejection' in admission) return admission.rejection
      return undefined
    } catch {
      // A connection service that throws is a composition bug; fall through to
      // the structural fence rather than answering 500 for every request.
    }
  }
  return structuralRejection(req)
}

/**
 * The replica fence. Same shape as the kernel's `isTrustedApiRequest`: DNS
 * rebinding defence via the Host header, cross-site fetch refusal, and an
 * Origin/Referer authority match.
 */
export function structuralRejection(req) {
  const host = authorityOf(req.headers.host, 'http')
  if (host === null || !LOOPBACK_NAMES.has(host.hostname)) return 403
  const site = String(req.headers['sec-fetch-site'] ?? '').toLowerCase()
  if (site === 'cross-site') return 403
  for (const header of ['origin', 'referer']) {
    const raw = req.headers[header]
    if (typeof raw !== 'string' || raw.trim() === '') continue
    let authority
    try {
      authority = authorityOf(raw.trim())
    } catch {
      return 403
    }
    if (authority === null) return 403
    // The web server speaks plain http on a loopback bind, so an Origin that
    // claims https — or any other scheme — is not this page.
    if (authority.scheme !== host.scheme || authority.hostname !== host.hostname || authority.port !== host.port) return 403
  }
  return undefined
}

/** Split a Host/Origin/Referer value into {scheme, hostname, port}, defaulting the port. */
function authorityOf(value, defaultScheme) {
  if (typeof value !== 'string' || value.trim() === '') return null
  let url
  try {
    url = new URL(value.includes('://') ? value.trim() : `${defaultScheme ?? 'http'}://${value.trim()}`)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const port = url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port
  return { scheme: url.protocol.replace(':', ''), hostname: url.hostname.toLowerCase(), port }
}
