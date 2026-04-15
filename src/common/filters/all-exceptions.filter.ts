import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface PrismaError {
  code?: string;
  meta?: Record<string, unknown>;
}

function isPrismaError(err: unknown): err is PrismaError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as PrismaError).code === 'string' &&
    (err as PrismaError).code!.startsWith('P')
  );
}

function prismaStatusCode(code: string): HttpStatus {
  switch (code) {
    case 'P2002':
      return HttpStatus.CONFLICT;
    case 'P2025':
      return HttpStatus.NOT_FOUND;
    case 'P2003':
      return HttpStatus.BAD_REQUEST;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

function prismaMessage(code: string): string {
  switch (code) {
    case 'P2002':
      return 'A record with this value already exists';
    case 'P2025':
      return 'The requested resource was not found';
    case 'P2003':
      return 'Related resource not found';
    default:
      return 'A database error occurred';
  }
}

function isHealthRoute(path: string): boolean {
  return /\/health(?:\/|$)/.test(path);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const isProduction = process.env['NODE_ENV'] === 'production';
    const healthRoute = isHealthRoute(request.url);

    let statusCode: HttpStatus;
    let message: string;
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionBody = exception.getResponse();
      if (typeof exceptionBody === 'string') {
        message = exceptionBody;
      } else if (
        Array.isArray((exceptionBody as { message?: unknown }).message)
      ) {
        message = 'Validation failed';
      } else {
        message =
          (exceptionBody as { message?: string }).message ?? exception.message;
      }
      details = typeof exceptionBody === 'object' ? exceptionBody : undefined;
    } else if (isPrismaError(exception)) {
      statusCode = prismaStatusCode(exception.code!);
      message = prismaMessage(exception.code!);
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    if (healthRoute && statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'Service unavailable';
      details = undefined;
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, requestId: request.id },
        `Unhandled exception: ${message}`,
      );
    }

    const body: Record<string, unknown> = {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.id,
    };

    if (
      !healthRoute &&
      !isProduction &&
      statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      body['stack'] = exception instanceof Error ? exception.stack : undefined;
      if (details) {
        body['details'] = details;
      }
    } else if (
      !healthRoute &&
      statusCode < HttpStatus.INTERNAL_SERVER_ERROR &&
      details
    ) {
      body['details'] = details;
    }

    response.status(statusCode).json(body);
  }
}
