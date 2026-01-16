/**
 * @parsrun/service-adapters - Payments Service
 * Service definition and adapter for Payments microservice
 */

export { paymentsServiceDefinition, type PaymentsServiceDefinition } from "./definition.js";
export {
  createPaymentsServiceServer,
  type PaymentsServiceServerOptions,
} from "./server.js";
export {
  createPaymentsServiceClient,
  type PaymentsServiceClient,
} from "./client.js";
