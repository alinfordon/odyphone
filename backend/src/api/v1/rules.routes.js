import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { createRule, deleteRule, getRule, listRules, testRule, updateRule } from "../../services/ruleService.js";
import { writeAudit } from "../../services/auditService.js";
import { idSchema, ruleCreateSchema, ruleTestSchema, ruleUpdateSchema } from "../schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  sendData(res, await listRules(req.user.id));
}));

router.post("/test", validate(ruleTestSchema), asyncHandler(async (req, res) => {
  sendData(res, await testRule(req.user.id, req.validated.body));
}));

router.post("/", validate(ruleCreateSchema), asyncHandler(async (req, res) => {
  const rule = await createRule(req.user.id, req.validated.body);
  await writeAudit(req, "rule.create", { targetType: "rule", targetId: rule.id, metadata: { action: rule.action } });
  sendData(res, rule, 201);
}));

router.get("/:id", validate(idSchema), asyncHandler(async (req, res) => {
  const rule = await getRule(req.user.id, req.validated.params.id);
  sendData(res, rule.toPublic());
}));

router.patch("/:id", validate(ruleUpdateSchema), asyncHandler(async (req, res) => {
  const rule = await updateRule(req.user.id, req.validated.params.id, req.validated.body);
  await writeAudit(req, "rule.update", { targetType: "rule", targetId: rule.id, metadata: { action: rule.action } });
  sendData(res, rule);
}));

router.delete("/:id", validate(idSchema), asyncHandler(async (req, res) => {
  const result = await deleteRule(req.user.id, req.validated.params.id);
  await writeAudit(req, "rule.delete", { targetType: "rule", targetId: result.id });
  sendData(res, result);
}));

export const rulesRouter = router;
