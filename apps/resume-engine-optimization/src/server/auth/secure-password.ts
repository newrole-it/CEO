import SecurePasswordLib from "secure-password"
import { AuthenticationError } from "src/shared/errors"

/**
 * Password hashes as @blitzjs/auth/secure-password made them: secure-password (argon2id through
 * sodium-native) over the UTF-8 password, stored as base64. Hashes made under Blitz verify here.
 */
export const SecurePassword = {
  VALID: SecurePasswordLib.VALID,
  VALID_NEEDS_REHASH: SecurePasswordLib.VALID_NEEDS_REHASH,
  INVALID: SecurePasswordLib.INVALID,
  INVALID_UNRECOGNIZED_HASH: SecurePasswordLib.INVALID_UNRECOGNIZED_HASH,

  async hash(password: string): Promise<string> {
    if (!password) throw new AuthenticationError()
    const hashed = await new SecurePasswordLib().hash(Buffer.from(password))
    return hashed.toString("base64")
  },

  /** VALID or VALID_NEEDS_REHASH; anything else throws AuthenticationError. */
  async verify(hashedPassword: string, password: string): Promise<symbol> {
    if (!hashedPassword || !password) throw new AuthenticationError()
    let result: symbol
    try {
      result = await new SecurePasswordLib().verify(
        Buffer.from(password),
        Buffer.from(hashedPassword, "base64")
      )
    } catch {
      throw new AuthenticationError()
    }
    if (result === SecurePasswordLib.VALID || result === SecurePasswordLib.VALID_NEEDS_REHASH) {
      return result
    }
    throw new AuthenticationError()
  },
}
