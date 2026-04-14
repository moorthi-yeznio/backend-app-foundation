import { registerAs } from '@nestjs/config';

export default registerAs('cors', () => ({
  origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim()),
  credentials: true,
}));
