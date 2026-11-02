import { z } from "zod"

export const email = z
  .string()
  .email()
  .transform((str) => str.toLowerCase().trim())

export const password = z
  .string()
  .min(10)
  .max(100)
  .transform((str) => str.trim())

export const Login = z.object({
  email,
  // Capped so nobody makes the server hash megabytes per guess.
  password: z.string().max(200),
})

/** AuthenticationError message from login when the attempt limit is reached. */
export const LOGIN_LIMITED = "too-many-attempts"
