/**
 * The bytes an installed user actually receives for a file in this repository.
 *
 * `.gitattributes` says `* text=auto eol=lf`, so git stores and serves the LF blob
 * for every text file — through a `git+https` dependency, through
 * raw.githubusercontent, and through jsDelivr alike. An editor on Windows can
 * leave the *working tree* in CRLF without `git status` objecting, and a release
 * manifest built from those bytes promises a file that is a few hundred bytes
 * longer than the one that downloads. The upgrader verifies size first, so every
 * user's upgrade then fails at staging: issue #1 again, wearing line endings.
 *
 * Both sides of that boundary — the builder that writes the manifest and the
 * end-to-end gate that reads it — have to mean the same thing by "the file",
 * which is why this lives in one place.
 */

const CRLF = Buffer.from('\r\n')
const LF = Buffer.from('\n')

/** @param {Buffer} body @returns {Buffer} */
export function publishedBytes(body) {
  // A NUL byte is the cheap tell for "binary", and git stores those verbatim —
  // normalizing one would corrupt the very digest the manifest exists to pin.
  if (body.includes(0) || !body.includes(CRLF)) return body
  const parts = []
  let from = 0
  while (true) {
    const at = body.indexOf(CRLF, from)
    if (at === -1) break
    parts.push(body.subarray(from, at), LF)
    from = at + CRLF.length
  }
  parts.push(body.subarray(from))
  return Buffer.concat(parts)
}
