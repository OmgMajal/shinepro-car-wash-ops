import 'node:process';

export const config = Object.freeze({
  env: process.env.APP_ENV || 'development',
  label: process.env.APP_LABEL || 'CARWASH STAGING',
  port: Number(process.env.PORT || 8787),
  databaseUrl: process.env.DATABASE_URL,
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 28800),
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 1048576),
  passwordPepper: process.env.PASSWORD_PEPPER || 'development-only-change-me',
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:8787',
  paymentsMode: process.env.PAYMENTS_MODE || 'test',
  notificationsMode: process.env.NOTIFICATIONS_MODE || 'disabled',
  publicBusinessId: process.env.PUBLIC_BUSINESS_ID || null
});

export function assertProductionConfig() {
  if (config.env === 'production' && (!config.databaseUrl || config.passwordPepper === 'development-only-change-me' || config.paymentsMode === 'test')) {
    throw new Error('Production configuration is incomplete: database, password pepper, and payment mode must be explicit.');
  }
}
