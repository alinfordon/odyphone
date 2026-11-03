import { PhoneContact } from "../models/PhoneContact.js";
import { notFound } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";
import { escapeRegex, normalizePhoneNumber } from "../utils/phone.js";
import { getSettings } from "./settingsService.js";

function publicContact(doc) {
  return doc.toPublic();
}

export async function listContacts(userId, query) {
  const filter = { userId };
  if (query.category) filter.category = query.category;
  if (query.enabled === "true") filter.enabled = true;
  if (query.enabled === "false") filter.enabled = false;
  if (query.aiEnabled === "true") filter.aiEnabled = true;
  if (query.aiEnabled === "false") filter.aiEnabled = false;
  if (query.q) {
    const safe = escapeRegex(query.q.trim());
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { phoneNumber: { $regex: safe, $options: "i" } },
      { normalizedPhoneNumber: { $regex: safe, $options: "i" } },
    ];
  }
  const contacts = await PhoneContact.find(filter).sort({ name: 1 });
  return contacts.map(publicContact);
}

export async function getContact(userId, id) {
  assertObjectId(id, "contact id");
  const contact = await PhoneContact.findOne({ _id: id, userId });
  if (!contact) throw notFound("Contactul nu a fost găsit.");
  return contact;
}

export async function createContact(userId, input) {
  const settings = await getSettings(userId);
  const phone = normalizePhoneNumber(input.phoneNumber, input.defaultCountry || settings.defaultCountry);
  const contact = await PhoneContact.create({
    userId,
    name: input.name,
    phoneNumber: phone.phoneNumber,
    normalizedPhoneNumber: phone.normalizedPhoneNumber,
    category: input.category,
    description: input.description || "",
    relationship: input.relationship || "",
    aiEnabled: input.aiEnabled ?? false,
    greeting: input.greeting || "",
    customInstructions: input.customInstructions || "",
    priority: input.priority ?? 0,
    enabled: input.enabled ?? true,
  });
  return publicContact(contact);
}

export async function updateContact(userId, id, input) {
  const contact = await getContact(userId, id);
  if (input.phoneNumber) {
    const settings = await getSettings(userId);
    const phone = normalizePhoneNumber(input.phoneNumber, settings.defaultCountry);
    contact.phoneNumber = phone.phoneNumber;
    contact.normalizedPhoneNumber = phone.normalizedPhoneNumber;
  }
  const fields = [
    "name",
    "category",
    "description",
    "relationship",
    "aiEnabled",
    "greeting",
    "customInstructions",
    "priority",
    "enabled",
  ];
  for (const field of fields) {
    if (input[field] !== undefined) contact[field] = input[field];
  }
  await contact.save();
  return publicContact(contact);
}

export async function deleteContact(userId, id) {
  const contact = await getContact(userId, id);
  await contact.deleteOne();
  return { id: String(contact._id), deleted: true };
}
