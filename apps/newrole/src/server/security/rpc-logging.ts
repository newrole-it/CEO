/**
 * Options for Blitz RpcServerPlugin. Without them @blitzjs/rpc logs every resolver input at info
 * and every result at debug, and those hold passwords (setPassword) and fresh extension tokens
 * (createExtensionToken). Errors are still logged: RpcLogger.error ignores these options.
 */
export const RPC_LOGGING = { verbose: false }
