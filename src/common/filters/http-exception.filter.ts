import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Error as MongooseError } from 'mongoose';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message: string | string[] = 'Internal server error';
        let error = 'Internal Server Error';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object') {
                message = (exceptionResponse as any).message || message;
                error = (exceptionResponse as any).error || error;
            }
        } else if (exception instanceof MongooseError.ValidationError) {
            status = HttpStatus.BAD_REQUEST;
            error = 'Validation Error';
            message = Object.values(exception.errors).map((err) => err.message);
        } else if (exception instanceof MongooseError.CastError) {
            status = HttpStatus.BAD_REQUEST;
            error = 'Invalid ID Format';
            message = 'The provided ID is not valid';
        } else if ((exception as any).code === 11000) {
            // MongoDB duplicate key error
            status = HttpStatus.CONFLICT;
            error = 'Duplicate Entry';
            message = 'A record with this data already exists';
        } else if (exception instanceof Error) {
            message = exception.message;
        }

        response.status(status).json({
            statusCode: status,
            error,
            message,
            timestamp: new Date().toISOString(),
        });
    }
}
