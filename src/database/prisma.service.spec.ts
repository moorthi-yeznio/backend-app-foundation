import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@prisma/client', () => {
  const mockConnect = jest.fn().mockResolvedValue(undefined);
  const mockDisconnect = jest.fn().mockResolvedValue(undefined);
  const MockPrismaClient = jest.fn().mockImplementation(() => {
    return {
      $connect: mockConnect,
      $disconnect: mockDisconnect,
    };
  });
  return { PrismaClient: MockPrismaClient };
});

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose $connect method', () => {
    expect(typeof service.$connect).toBe('function');
  });

  it('should expose $disconnect method', () => {
    expect(typeof service.$disconnect).toBe('function');
  });
});
