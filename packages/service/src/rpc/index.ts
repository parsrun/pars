/**
 * @parsrun/service - RPC Module
 * Request-response communication layer
 */

export { RpcClient, createRpcClient, type CallOptions } from "./client.js";
export {
  RpcServer,
  createRpcServer,
  loggingMiddleware,
  validationMiddleware,
  tenantMiddleware,
  type RpcHandler,
  type RpcHandlers,
  type RpcMiddleware,
  type RpcHandlerContext,
} from "./server.js";
export {
  EmbeddedTransport,
  createEmbeddedTransport,
  EmbeddedRegistry,
  getEmbeddedRegistry,
} from "./transports/embedded.js";
export {
  HttpTransport,
  createHttpTransport,
  createHttpHandler,
  type HttpTransportOptions,
} from "./transports/http.js";
export {
  RpcError,
  ServiceNotFoundError,
  MethodNotFoundError,
  VersionMismatchError,
  TimeoutError,
  CircuitOpenError,
  BulkheadRejectedError,
  TransportError,
  SerializationError,
  toRpcError,
} from "./errors.js";
