// @types/react-dom is not installed; interactive.tsx only needs createPortal.
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react"
  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment
  ): ReactPortal
}
