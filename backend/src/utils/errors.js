export class ApiError extends Error {
  constructor(status, message, code = "REQUEST_ERROR", details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = "Nu a fost găsit.") {
  return new ApiError(404, message, "NOT_FOUND");
}

export function forbidden(message = "Interzis") {
  return new ApiError(403, message, "FORBIDDEN");
}
