import type { Logger } from "@gnucash-ng/logging";

export interface ParsedRequestBodyResult {
  body?: unknown;
  errorCode?: "request.invalid" | "request.too_large" | "request.unsupported_media_type";
  errorMessage?: string;
  status?: 400 | 413 | 415;
}

async function parseJsonBody(request: Request, maxBodyBytes: number): Promise<unknown> {
  try {
    const text = await request.text();

    if (Buffer.byteLength(text, "utf8") > maxBodyBytes) {
      return Symbol.for("body-too-large");
    }

    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function parsePostRequestBody(params: {
  bodylessPostRoute: boolean;
  maxBodyBytes: number;
  request: Request;
  requestLogger: Logger;
}): Promise<ParsedRequestBodyResult> {
  const { bodylessPostRoute, maxBodyBytes, request, requestLogger } = params;

  if (!bodylessPostRoute && !request.headers.get("content-type")?.includes("application/json")) {
    requestLogger.warn("http request validation failed", {
      errors: ["POST requests must use application/json."],
    });
    return {
      errorCode: "request.unsupported_media_type",
      errorMessage: "POST requests must use application/json.",
      status: 415,
    };
  }

  const body = bodylessPostRoute ? undefined : await parseJsonBody(request, maxBodyBytes);

  if (body === Symbol.for("body-too-large")) {
    requestLogger.warn("http request rejected for size limit");
    return {
      errorCode: "request.too_large",
      errorMessage: "Request body exceeds the configured size limit.",
      status: 413,
    };
  }

  if (!bodylessPostRoute && body === undefined) {
    requestLogger.warn("http request validation failed", {
      errors: ["Request body must be valid JSON."],
    });
    return {
      errorCode: "request.invalid",
      errorMessage: "Request body must be valid JSON.",
      status: 400,
    };
  }

  return { body };
}

export async function parsePutRequestBody(params: {
  maxBodyBytes: number;
  request: Request;
  requestLogger: Logger;
}): Promise<ParsedRequestBodyResult> {
  const { maxBodyBytes, request, requestLogger } = params;

  if (!request.headers.get("content-type")?.includes("application/json")) {
    requestLogger.warn("http request validation failed", {
      errors: ["PUT requests must use application/json."],
    });
    return {
      errorCode: "request.unsupported_media_type",
      errorMessage: "PUT requests must use application/json.",
      status: 415,
    };
  }

  const body = await parseJsonBody(request, maxBodyBytes);

  if (body === Symbol.for("body-too-large")) {
    requestLogger.warn("http request rejected for size limit");
    return {
      errorCode: "request.too_large",
      errorMessage: "Request body exceeds the configured size limit.",
      status: 413,
    };
  }

  if (body === undefined) {
    requestLogger.warn("http request validation failed", {
      errors: ["Request body must be valid JSON."],
    });
    return {
      errorCode: "request.invalid",
      errorMessage: "Request body must be valid JSON.",
      status: 400,
    };
  }

  return { body };
}
