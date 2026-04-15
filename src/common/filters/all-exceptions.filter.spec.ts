/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
const mockGetRequest = jest
  .fn()
  .mockReturnValue({ url: '/test', method: 'GET', id: 'req-123' });

const mockHost = {
  switchToHttp: () => ({
    getResponse: mockGetResponse,
    getRequest: mockGetRequest,
    getNext: jest.fn(),
  }),
} as unknown as ArgumentsHost;

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('maps HttpException to correct status and message', () => {
    const exception = new NotFoundException('Resource not found');
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Resource not found',
        requestId: 'req-123',
      }),
    );
  });

  it('maps unknown errors to 500', () => {
    const exception = new Error('Something exploded');
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      }),
    );
  });

  it('includes timestamp in response', () => {
    filter.catch(new HttpException('test', 400), mockHost);
    const body = mockJson.mock.calls[0]?.[0] as unknown;
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');
    if (!body || typeof body !== 'object') {
      throw new Error('Expected response body');
    }
    expect(typeof (body as Record<string, unknown>)['timestamp']).toBe(
      'string',
    );
  });

  it('maps prisma-like errors to expected status and message', () => {
    const exception: { code: string } = { code: 'P2002' };
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        message: 'A record with this value already exists',
      }),
    );
  });

  it('hides stack and details for health endpoints', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    mockGetRequest.mockReturnValueOnce({
      url: '/api/v1/health/ready',
      method: 'GET',
      id: 'req-123',
    });

    filter.catch(new Error('db unavailable'), mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Service unavailable',
      }),
    );
    const body = mockJson.mock.calls[0]?.[0] as unknown;
    expect(body).toBeDefined();
    if (!body || typeof body !== 'object') {
      throw new Error('Expected response body for health error');
    }
    expect('stack' in body).toBe(false);
    expect('details' in body).toBe(false);

    process.env.NODE_ENV = previousNodeEnv;
  });
});
