import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
  it('uses defaults when no values provided', async () => {
    const dto = plainToInstance(PaginationDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('accepts valid page and limit', async () => {
    const dto = plainToInstance(PaginationDto, { page: 2, limit: 50 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('rejects page less than 1', async () => {
    const dto = plainToInstance(PaginationDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects limit over 100', async () => {
    const dto = plainToInstance(PaginationDto, { limit: 101 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('computes skip correctly', () => {
    const dto = plainToInstance(PaginationDto, { page: 3, limit: 10 });
    expect(dto.skip).toBe(20);
  });
});
