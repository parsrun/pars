/**
 * @parsrun/service-adapters - Email Service
 * Service definition and adapter for Email microservice
 */

export { emailServiceDefinition, type EmailServiceDefinition } from "./definition.js";
export {
  createEmailServiceServer,
  type EmailServiceServerOptions,
} from "./server.js";
export {
  createEmailServiceClient,
  type EmailServiceClient,
} from "./client.js";
