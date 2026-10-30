/**
 * Error codes the feedback RPC throws, safe to import in client components.
 * A guest (no session, or a GUEST session) gets an AuthenticationError whose message is
 * SIGN_IN_REQUIRED: show the sign-in prompt instead of an error.
 */
export const SIGN_IN_REQUIRED = "sign-in-required"

export function isSignInRequired(error: unknown): boolean {
  return error instanceof Error && error.name === "AuthenticationError"
}
