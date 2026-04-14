import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  prefix: process.env.API_PREFIX ?? 'api',
  version: process.env.API_VERSION ?? 'v1',
  isProduction: process.env.NODE_ENV === 'production',
}));
