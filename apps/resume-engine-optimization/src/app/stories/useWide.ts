"use client"

import { useEffect, useState } from "react"

/** True from 1024 px: the editor sits next to the list. Below that it opens as a drawer. */
export function useWide(): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const update = () => setWide(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return wide
}
