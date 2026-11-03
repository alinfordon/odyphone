import { logger } from "../config/logger.js";

export function notFoundHandler(_req, res) {
  res.status(404).json({
    error: {
      message: "Resursa nu a fost găsită.",
      code: "NOT_FOUND",
    },
  });
}

export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;
  let status = err.status || 500;
  let message = err.message || "Eroare internă";
  let code = err.code || "INTERNAL";

  if (err.name === "CastError") {
    status = 400;
    message = "Identificator invalid.";
    code = "INVALID_ID";
  } else if (err.code === 11000) {
    status = 409;
    message = "Există deja o înregistrare cu această valoare.";
    code = "DUPLICATE";
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.id }, "request failed");
  }
  if (status >= 500 && !err.status) {
    message = "Eroare internă";
    code = "INTERNAL";
  }

  const body = {
    error: {
      message,
      code,
      details: err.details,
    },
  };
  if (err.payload) body.data = err.payload;
  res.status(status).json(body);
}
