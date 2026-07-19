export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(403, message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not Found") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict. Data changed elsewhere.") {
    super(409, message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Validation Error", data?: any) {
    super(422, message, data);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends ApiError {
  constructor(message = "Too Many Requests") {
    super(429, message);
    this.name = "RateLimitError";
  }
}

export class ServerError extends ApiError {
  constructor(message = "Internal Server Error") {
    super(500, message);
    this.name = "ServerError";
  }
}

export function createApiError(status: number, data: any): ApiError {
  const message = data?.detail || data?.message || `API Error ${status}`;
  
  switch (status) {
    case 401: return new UnauthorizedError(message);
    case 403: return new ForbiddenError(message);
    case 404: return new NotFoundError(message);
    case 409: return new ConflictError(message);
    case 422: return new ValidationError(message, data);
    case 429: return new RateLimitError(message);
    default:
      if (status >= 500) {
        return new ServerError(message);
      }
      return new ApiError(status, message, data);
  }
}
