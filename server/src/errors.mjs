export class AppError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message); this.code = code; this.status = status; this.details = details;
  }
}
export function errorResponse(error) {
  if (error instanceof AppError) return { status: error.status, body: { error: error.code, message: error.message, details: error.details } };
  console.error(error);
  return { status: 500, body: { error: 'INTERNAL_ERROR', message: 'Something went wrong. Try again or contact support.' } };
}
