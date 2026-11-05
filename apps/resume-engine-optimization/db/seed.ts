import "../src/server/load-env"
import { PrismaClient } from "@prisma/client"
import { SecurePassword } from "@blitzjs/auth/secure-password"
import { assertSafeProductionEnv } from "../src/server/security/env-check"

const db = new PrismaClient()

async function main() {
  // Keeps the old project name: a new default would create a second owner on existing installs.
  const email = (process.env.OWNER_EMAIL || "owner@nowarola.local").toLowerCase()
  const password = process.env.OWNER_PASSWORD || "jobscanner-local"
  // The owner row keeps its first password, so a public server must not create it with the sample.
  assertSafeProductionEnv({ ...process.env, OWNER_PASSWORD: password })
  const name = process.env.OWNER_NAME || "Owner"
  if (password.length < 10) throw new Error("OWNER_PASSWORD must be at least 10 characters")
  const hashedPassword = await SecurePassword.hash(password)
  const existing = await db.user.findUnique({ where: { email } })
  if (!existing) {
    await db.user.create({
      data: { email, name, hashedPassword, role: "ADMIN", timezone: "Europe/Warsaw", locale: "pl" },
    })
    console.log(`Created owner ${email}`)
  } else if (existing.role !== "ADMIN") {
    await db.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } })
    console.log(`Promoted owner ${email} to admin`)
  } else {
    console.log(`Owner ${email} already exists`)
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await db.$disconnect()
    process.exit(1)
  })
