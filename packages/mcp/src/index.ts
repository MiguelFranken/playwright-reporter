/**
 * Programmatic surface of the bridge, for embedding and tests. Most users only need the `pw-reporter-mcp` bin.
 */
export {
  connectRemote,
  createBridgeServer,
  describeConnectError,
  isUnauthorized,
  mirroredCapabilities,
  tokenRejectedMessage,
  type BridgeServerOptions,
  type ConnectRemoteOptions,
} from './bridge';
export { bridgeHeaders, ConfigError, detectRepo, loadConfig, mcpEndpoint, parseBoolean, VERSION, type BridgeConfig } from './config';
