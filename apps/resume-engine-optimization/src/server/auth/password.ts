import db from "db"
import { AuthenticationError } from "src/shared/errors"
import { Login } from "src/app/(auth)/validations"
import { SecurePassword } from "./secure-password"

/** The user the email and password belong to, without the hash; AuthenticationError otherwise. */
export async function authenticateUser(rawEmail: string, rawPassword: string) {
  const { email, password } = Login.parse({ email: rawEmail, password: rawPassword })
  const user = await db.user.findFirst({ where: { email } })
  if (!user?.hashedPassword) throw new AuthenticationError()

  const result = await SecurePassword.verify(user.hashedPassword, password)

  if (result === SecurePassword.VALID_NEEDS_REHASH) {
    // Upgrade hashed password with a more secure hash
    const improvedHash = await SecurePassword.hash(password)
    await db.user.update({ where: { id: user.id }, data: { hashedPassword: improvedHash } })
  }

  const { hashedPassword, ...rest } = user
  return rest
}
