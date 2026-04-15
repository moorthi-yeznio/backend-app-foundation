import { NextFunction, Request, Response } from 'express';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let req: Partial<Request> & { id?: string };
  let res: Partial<Response>;
  let next: jest.MockedFunction<NextFunction>;
  let setHeader: jest.Mock;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
    req = { headers: {} };
    setHeader = jest.fn();
    res = { setHeader };
    next = jest.fn();
  });

  it('uses valid incoming request id', () => {
    req.headers = { 'x-request-id': 'req_123-abc' };

    middleware.use(req as Request & { id?: string }, res as Response, next);

    expect(req.id).toBe('req_123-abc');
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', 'req_123-abc');
    expect(next).toHaveBeenCalled();
  });

  it('generates a request id when header is invalid', () => {
    req.headers = { 'x-request-id': 'bad\nheader' };

    middleware.use(req as Request & { id?: string }, res as Response, next);

    expect(req.id).toBeDefined();
    expect(req.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', req.id);
    expect(next).toHaveBeenCalled();
  });

  it('generates request id when header exceeds max length', () => {
    req.headers = { 'x-request-id': 'a'.repeat(65) };

    middleware.use(req as Request & { id?: string }, res as Response, next);

    expect(req.id).toBeDefined();
    expect(req.id).not.toBe('a'.repeat(65));
  });
});
