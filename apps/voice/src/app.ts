import Fastify from 'fastify';
import { logger } from './logger.js';

/**
 * Fastify instance factory.
 *
 * Handing Fastify a concrete pino instance narrows its logger generic, so the
 * route registrars have to be typed against *this* instance rather than the
 * default `FastifyInstance`. Deriving the type from the factory keeps one
 * logger for the whole process without hand-writing the generic parameters.
 */
export function createApp() {
  return Fastify({ loggerInstance: logger, trustProxy: true });
}

export type AppInstance = ReturnType<typeof createApp>;
