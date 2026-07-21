export class ApiError extends Error {
  public status: number;
  public data: unknown;

  constructor(status: number, message: string, data?: unknown) {
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
  constructor(message = "Validation Error", data?: unknown) {
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

export function createApiError(status: number, data: unknown): ApiError {
  const message = getErrorDetail(data) ?? `API Error ${status}`;
  
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

function getErrorDetail(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.detail === "string") {
    return record.detail;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  if (Array.isArray(record.detail)) {
    const messages = record.detail
      .map((item) => {
        if (!item || typeof item !== "object") return undefined;
        const message = (item as Record<string, unknown>).msg;
        return typeof message === "string" ? message : undefined;
      })
      .filter((message): message is string => Boolean(message));

    return messages.length > 0 ? messages.join("; ") : undefined;
  }

  return undefined;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  switch (error.status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested item could not be found.";
    case 409:
      return "This item changed elsewhere. Refresh and try again.";
    case 422:
      return error.message || "Please check the submitted values.";
    case 429:
      return "Too many requests. Please wait and try again.";
    default:
      return error.status >= 500 ? fallback : error.message || fallback;
  }
}
