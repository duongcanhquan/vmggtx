/**
 * [QA-FIX B] Verify cookie parent_session trên Edge (middleware).
 * Cùng format với parent-portal/actions: `${studentId}.${hmacSha256Hex}`.
 */

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

function resolveParentCookieSecret(): string | null {
  const dedicated = process.env.PARENT_SESSION_SECRET
  if (dedicated) return dedicated
  if (process.env.NODE_ENV === 'production') return null
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    'gdtx-dev-secret'
  )
}

/** true nếu cookie có chữ ký HMAC hợp lệ */
export async function verifyParentSessionCookie(
  raw: string | undefined
): Promise<boolean> {
  if (!raw) return false
  const separator = raw.lastIndexOf('.')
  if (separator <= 0) return false

  const studentId = raw.slice(0, separator)
  const signature = raw.slice(separator + 1)
  if (!studentId || !signature) return false

  const secret = resolveParentCookieSecret()
  if (!secret) return false

  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(studentId))
    const expected = toHex(sigBuf)
    return timingSafeEqualHex(signature, expected)
  } catch {
    return false
  }
}
