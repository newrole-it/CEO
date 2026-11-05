"use client"

import { createContext, useContext } from "react"

const LinkedInSignInContext = createContext(false)

export function LinkedInSignInProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  return <LinkedInSignInContext.Provider value={enabled}>{children}</LinkedInSignInContext.Provider>
}

export function useLinkedInSignIn() {
  return useContext(LinkedInSignInContext)
}
