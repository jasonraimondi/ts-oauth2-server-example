import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AppLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const { ip, method, originalUrl } = request;
    const userAgent = request.get('user-agent') || '';
    const host = request.get('host') || '';

    response.on('finish', () => {
      const { statusCode } = response;
      const length = response.get('content-length');
      const contentLength = length === undefined ? '(unknown)' : length;

      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${contentLength} ${host} - ${userAgent} ${ip}`,
      );
    });

    next();
  }
}
