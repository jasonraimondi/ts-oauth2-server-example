import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';

const getLogLevels = (): LogLevel[] => {
  switch (process.env.LOG_LEVEL) {
    case 'ERROR':
      return ['error'];
    case 'WARN':
      return ['warn', 'error'];
    case 'LOG':
      return ['log', 'warn', 'error'];
    case 'DEBUG':
      return ['debug', 'log', 'warn', 'error'];
    case 'VERBOSE':
      return ['verbose', 'debug', 'log', 'warn', 'error'];
    default:
      return ['log', 'warn', 'error'];
  }
};

@Injectable()
export class LocalLogger extends ConsoleLogger {
  constructor(logContext: string) {
    super(logContext, { logLevels: getLogLevels() });
  }

  getTimestamp() {
    return new Date().toISOString();
  }
}
