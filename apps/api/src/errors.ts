export type ApiErrorCode =
  | "auth.forbidden"
  | "auth.required"
  | "book.already_exists"
  | "config.invalid"
  | "internal.unexpected"
  | "repository.invalid_identifier"
  | "repository.unavailable"
  | "request.invalid"
  | "request.not_found"
  | "request.too_large"
  | "request.unsupported_media_type"
  | "security.rate_limited"
  | "validation.failed"
  | "book.not_found";

export interface ApiErrorDetails {
  [key: string]: string | number | boolean | string[] | number[] | boolean[] | undefined;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetails;
  readonly expose: boolean;
  readonly status: number;

  constructor(params: {
    cause?: unknown;
    code: ApiErrorCode;
    details?: ApiErrorDetails;
    expose?: boolean;
    message: string;
    status: number;
  }) {
    super(params.message, params.cause ? { cause: params.cause } : undefined);
    this.name = "ApiError";
    this.code = params.code;
    this.details = params.details;
    this.expose = params.expose ?? true;
    this.status = params.status;
  }
}

export class ConfigValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid API configuration: ${issues.join("; ")}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

export interface ErrorEnvelope {
  error: {
    code: ApiErrorCode;
    details?: ApiErrorDetails;
    message: string;
    status: number;
  };
  errors: string[];
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof ConfigValidationError) {
    return new ApiError({
      code: "config.invalid",
      details: { issues: error.issues },
      message: error.issues[0] ?? "API configuration is invalid.",
      status: 500,
    });
  }

  return new ApiError({
    cause: error,
    code: "internal.unexpected",
    expose: false,
    message: "An unexpected error occurred.",
    status: 500,
  });
}

export function toErrorEnvelope(error: ApiError): ErrorEnvelope {
  const message = error.expose ? error.message : "An unexpected error occurred.";
  const issues =
    error.expose &&
    error.details &&
    "issues" in error.details &&
    Array.isArray(error.details.issues) &&
    error.details.issues.every((item) => typeof item === "string")
      ? error.details.issues
      : undefined;

  return {
    error: {
      code: error.code,
      details: error.expose ? error.details : undefined,
      message,
      status: error.status,
    },
    errors: issues && issues.length > 0 ? issues : [message],
  };
}
