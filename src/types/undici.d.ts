declare module "undici" {
  export class Agent {
    constructor(options?: {
      connect?: {
        lookup?: (
          hostname: string,
          options: unknown,
          callback: (err: Error | null, address: string, family: number) => void
        ) => void
      }
    })
    close(): Promise<void>
  }
}
