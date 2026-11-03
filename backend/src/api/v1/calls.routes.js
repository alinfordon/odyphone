import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { callsForExport, deleteCall, getCall, listCalls, summarizeCall, toCsv, updateCallFlags } from "../../services/callService.js";
import { requestTransfer } from "../../services/transferService.js";
import { writeAudit } from "../../services/auditService.js";
import { callFlagSchema, callListSchema, idSchema, transferSchema } from "../schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/", validate(callListSchema), asyncHandler(async (req, res) => {
  const result = await listCalls(req.user.id, req.validated.query);
  sendData(res, result.items, 200, result.meta);
}));

router.get("/export", asyncHandler(async (req, res) => {
  const rows = await callsForExport(req.user.id);
  await writeAudit(req, "call.export", { metadata: { count: rows.length } });
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"ody-calls.csv\"");
    res.send(toCsv(rows));
    return;
  }
  sendData(res, rows);
}));

router.get("/:id", validate(idSchema), asyncHandler(async (req, res) => {
  sendData(res, await getCall(req.user.id, req.validated.params.id));
}));

router.patch("/:id", validate(callFlagSchema), asyncHandler(async (req, res) => {
  sendData(res, await updateCallFlags(req.user.id, req.validated.params.id, req.validated.body));
}));

router.delete("/:id", validate(idSchema), asyncHandler(async (req, res) => {
  const result = await deleteCall(req.user.id, req.validated.params.id);
  await writeAudit(req, "call.delete", { targetType: "call", targetId: result.id });
  sendData(res, result);
}));

router.post("/:id/summary", validate(idSchema), asyncHandler(async (req, res) => {
  const call = await summarizeCall(req.user.id, req.validated.params.id);
  await writeAudit(req, "call.summary", { targetType: "call", targetId: call.id });
  sendData(res, call);
}));

router.post("/:id/transfer", validate(transferSchema), asyncHandler(async (req, _res) => {
  try {
    await requestTransfer({
      userId: req.user.id,
      callId: req.validated.params.id,
      targetNumber: req.validated.body.targetNumber,
    });
  } catch (error) {
    if (error.code === "TRANSFER_DENIED") {
      await writeAudit(req, "transfer.denied", {
        targetType: "call",
        targetId: req.validated.params.id,
        metadata: { authorized: false },
      });
    } else if (error.code === "TELEPHONY_NOT_CONNECTED") {
      await writeAudit(req, "transfer.authorized_not_sent", {
        targetType: "call",
        targetId: req.validated.params.id,
        metadata: { authorized: true, executed: false },
      });
    }
    throw error;
  }
}));

export const callsRouter = router;
