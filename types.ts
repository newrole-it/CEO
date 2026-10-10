import { SimpleRolesIsAuthorized } from "@blitzjs/auth"
import { User } from "@/db"

export type Role = "ADMIN" | "USER" | "GUEST"

declare module "@blitzjs/auth" {
  export interface Session {
    isAuthorized: SimpleRolesIsAuthorized<Role>
    PublicData: {
      userId: User["id"]
      role: Role
    }
  }
}
