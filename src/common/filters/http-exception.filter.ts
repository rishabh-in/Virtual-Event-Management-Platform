import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type ErrorMessage = string | string[];

interface ExceptionBody {
  code?: string;
  error?: string;
  message?: ErrorMessage;
}

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: ErrorMessage;
  path: string;
  timestamp: string;
}

const DEFAULT_ERROR_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const statusCode = this.getStatusCode(exception);
    const body = this.getExceptionBody(exception);

    if (!(exception instanceof HttpException)) {
      this.logger.error(this.formatUnexpectedError(exception));
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      code: this.getErrorCode(statusCode, body),
      message: this.getMessage(statusCode, body),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(errorResponse);
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getExceptionBody(exception: unknown): ExceptionBody {
    if (!(exception instanceof HttpException)) {
      return {
        message: 'Internal server error',
      };
    }

    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return {
        message: exceptionResponse,
      };
    }

    if (this.isExceptionBody(exceptionResponse)) {
      return exceptionResponse;
    }

    return {
      message: exception.message,
    };
  }

  private isExceptionBody(value: unknown): value is ExceptionBody {
    return typeof value === 'object' && value !== null;
  }

  private getErrorCode(statusCode: number, body: ExceptionBody): string {
    if (body.code) {
      return body.code;
    }

    if (statusCode === 400 && Array.isArray(body.message)) {
      return 'VALIDATION_ERROR';
    }

    return DEFAULT_ERROR_CODES[statusCode] ?? 'HTTP_ERROR';
  }

  private getMessage(statusCode: number, body: ExceptionBody): ErrorMessage {
    if (body.message) {
      return body.message;
    }

    return DEFAULT_ERROR_CODES[statusCode] ?? 'HTTP error';
  }

  private formatUnexpectedError(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.stack ?? exception.message;
    }

    return String(exception);
  }
}
