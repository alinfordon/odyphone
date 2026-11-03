import { ApiError } from "../utils/errors.js";

export function validate(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse({
      body: req.body ?? {},
      query: req.query ?? {},
      params: req.params ?? {},
    });
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return next(new ApiError(400, "Datele introduse nu sunt valide.", "VALIDATION_ERROR", details));
    }
    req.validated = parsed.data;
    return next();
  };
}
