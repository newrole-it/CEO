/**
 * Who answers for a server other people use. It comes from the deployment's environment, so the
 * code holds nobody's name. Null on a local install, where the person is their own operator.
 */
export type Operator = { name: string; contact: string; processors: string }

export function operator(env: Record<string, string | undefined> = process.env): Operator | null {
  const name = env.OPERATOR_NAME?.trim()
  const contact = env.OPERATOR_CONTACT?.trim()
  if (!name || !contact) return null
  return { name, contact, processors: env.OPERATOR_PROCESSORS?.trim() ?? "" }
}
