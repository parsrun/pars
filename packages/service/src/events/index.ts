/**
 * @parsrun/service - Events Module
 * Asynchronous event-based communication layer
 */

export {
  createEvent,
  toCloudEvent,
  toCompactEvent,
  fromCompactEvent,
  formatEventType,
  parseEventType,
  matchEventType,
  validateEvent,
  validateCompactEvent,
} from "./format.js";

export {
  EventEmitter,
  createEventEmitter,
  createTypedEmitter,
  ScopedEmitter,
  type EventEmitterOptions,
  type EmitOptions,
  type TypedEventEmitter,
} from "./emitter.js";

export {
  EventHandlerRegistry,
  createEventHandlerRegistry,
  type HandlerRegistration,
  type EventHandlerRegistryOptions,
} from "./handler.js";

export {
  MemoryEventTransport,
  createMemoryEventTransport,
  GlobalEventBus,
  getGlobalEventBus,
  type MemoryEventTransportOptions,
} from "./transports/memory.js";

export {
  DeadLetterQueue,
  createDeadLetterQueue,
  type DeadLetterEntry,
  type DeadLetterQueueOptions,
  type AddEntryOptions,
} from "./dead-letter.js";
