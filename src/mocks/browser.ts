import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { socketHandlers } from './socket-io';

export const worker = setupWorker(...handlers, ...socketHandlers);