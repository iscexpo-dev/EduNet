// Shared configuration for EduNet

export const config = {
  app: {
    name: 'EduNet',
    version: '0.0.1',
    environment: process.env.NODE_ENV || 'development',
  },
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    timeout: 1_0000,
  },
  auth: {
    tokenExpiry: 60 * 60 * 24 * 7, // 7 days
    refreshTokenExpiry: 60 * 60 * 24 * 30, // 30 days
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'edunet',
    user: process.env.DB_USER || 'postgres',
  },
  storage: {
    bucket: process.env.S3_BUCKET || 'edunet',
    region: process.env.S3_REGION || 'us-east-1',
  },
  features: {
    offlineMode: process.env.ENABLE_OFFLINE === 'true',
    biometricAuth: process.env.ENABLE_BIOMETRIC === 'true',
    aiRecommendations: process.env.ENABLE_AI === 'true',
  },
  i18n: {
    defaultLocale: 'en',
    supportedLocales: ['en', 'bn'],
  },
} as const;

export * from './env';
