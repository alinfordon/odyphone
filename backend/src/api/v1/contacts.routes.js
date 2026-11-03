import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { createContact, deleteContact, getContact, listContacts, updateContact } from "../../services/contactService.js";
import { writeAudit } from "../../services/auditService.js";
import { contactCreateSchema, contactListSchema, contactUpdateSchema, idSchema } from "../schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/", validate(contactListSchema), asyncHandler(async (req, res) => {
  sendData(res, await listContacts(req.user.id, req.validated.query));
}));

router.post("/", validate(contactCreateSchema), asyncHandler(async (req, res) => {
  const contact = await createContact(req.user.id, req.validated.body);
  await writeAudit(req, "contact.create", { targetType: "contact", targetId: contact.id });
  sendData(res, contact, 201);
}));

router.get("/:id", validate(idSchema), asyncHandler(async (req, res) => {
  const contact = await getContact(req.user.id, req.validated.params.id);
  sendData(res, contact.toPublic());
}));

router.patch("/:id", validate(contactUpdateSchema), asyncHandler(async (req, res) => {
  const contact = await updateContact(req.user.id, req.validated.params.id, req.validated.body);
  await writeAudit(req, "contact.update", { targetType: "contact", targetId: contact.id });
  sendData(res, contact);
}));

router.delete("/:id", validate(idSchema), asyncHandler(async (req, res) => {
  const result = await deleteContact(req.user.id, req.validated.params.id);
  await writeAudit(req, "contact.delete", { targetType: "contact", targetId: result.id });
  sendData(res, result);
}));

export const contactsRouter = router;
