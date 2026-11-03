import { z } from "zod";
import { CALL_STATUSES, CONTACT_CATEGORIES, MATCH_TYPES, RULE_ACTIONS } from "../../../shared/constants/index.js";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Introdu un email valid.");
const password = z.string().min(10, "Folosește cel puțin 10 caractere.").max(128, "Maximum 128 de caractere.");
const shortText = (max) => z.string().trim().min(1, "Completează acest câmp.").max(max);
const personName = shortText(80);
const optionalText = (max) => z.string().trim().max(max).optional();
const time = z.string().regex(/^\d{2}:\d{2}$/, "Folosește formatul HH:mm.");

const wholeQuery = (min, max, fallback) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === "") return fallback;
      const number = Number(value);
      if (!Number.isInteger(number) || number < min || number > max) {
        ctx.addIssue({ code: "custom", message: "Număr invalid." });
        return z.NEVER;
      }
      return number;
    });

const scheduleSchema = z
  .object({
    enabled: z.boolean().optional(),
    days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    startTime: time.optional(),
    endTime: time.optional(),
  })
  .optional();

const ruleShape = {
  name: shortText(80),
  description: optionalText(500),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000),
  matchType: z.enum(MATCH_TYPES),
  phoneNumber: optionalText(32),
  category: z.enum(CONTACT_CATEGORIES).optional(),
  schedule: scheduleSchema,
  action: z.enum(RULE_ACTIONS),
  forwardTo: optionalText(32),
  fallbackAction: z.enum(RULE_ACTIONS).optional(),
};

function withRuleChecks(schema) {
  return schema.superRefine((value, ctx) => {
    if (value.matchType === "exact_number" && !value.phoneNumber) {
      ctx.addIssue({ code: "custom", path: ["phoneNumber"], message: "O regulă pentru număr exact are nevoie de un număr de telefon." });
    }
    if (value.matchType === "contact_group" && !value.category) {
      ctx.addIssue({ code: "custom", path: ["category"], message: "O regulă pentru un grup de contacte are nevoie de o categorie." });
    }
    if (value.action === "forward_to_number" && !value.forwardTo) {
      ctx.addIssue({ code: "custom", path: ["forwardTo"], message: "O regulă de redirecționare are nevoie de un număr de destinație." });
    }
  });
}

const contactShape = {
  name: shortText(120),
  phoneNumber: z.string().trim().min(3).max(32),
  category: z.enum(CONTACT_CATEGORIES),
  description: optionalText(500),
  relationship: optionalText(80),
  aiEnabled: z.boolean().optional(),
  greeting: optionalText(300),
  customInstructions: optionalText(2000),
  priority: z.number().int().min(0).max(100).optional(),
  enabled: z.boolean().optional(),
};

const settingsShape = {
  aiAnsweringEnabled: z.boolean().optional(),
  answerUnknownCallers: z.boolean().optional(),
  fallbackAction: z.enum(RULE_ACTIONS).optional(),
  unknownCallerAction: z.enum(RULE_ACTIONS).optional(),
  priorityProtectionThreshold: z.number().int().min(0).max(100).optional(),
  ownerName: shortText(80).optional(),
  assistantName: shortText(40).optional(),
  greeting: z.string().trim().min(1).max(300).optional(),
  customSystemPrompt: z.string().trim().max(8000).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  defaultCountry: z.string().trim().regex(/^[A-Z]{2}$/).optional(),
  ownerPhoneNumber: z.string().trim().max(32).optional(),
  allowedTransferNumbers: z.array(z.string().trim().min(3).max(32)).max(5).optional(),
  maxCallDurationSeconds: z.number().int().min(30).max(7200).optional(),
  responseTimeoutMs: z.number().int().min(1000).max(60000).optional(),
  silenceMs: z.number().int().min(200).max(5000).optional(),
  recordingEnabled: z.boolean().optional(),
  transcriptRetentionDays: z.number().int().min(1).max(3650).optional(),
  recordingRetentionDays: z.number().int().min(1).max(3650).optional(),
  callMetadataRetentionDays: z.number().int().min(1).max(3650).optional(),
};

function envelope({ body, query, params } = {}) {
  return z.object({
    body: body || z.object({}),
    query: query || z.object({}),
    params: params || z.object({}),
  });
}

const idParams = z.object({ id: z.string().min(1) });

export const registerSchema = envelope({
  body: z.object({
    email,
    password,
    name: personName,
    client: z.enum(["web", "mobile"]).optional(),
  }),
});

export const loginSchema = envelope({
  body: z.object({
    email,
    password: z.string().min(1).max(128),
    client: z.enum(["web", "mobile"]).optional(),
  }),
});

export const refreshSchema = envelope({
  body: z.object({
    refreshToken: z.string().min(10).optional(),
    client: z.enum(["web", "mobile"]).optional(),
  }),
});

export const passwordSchema = envelope({
  body: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  }),
});

export const contactCreateSchema = envelope({ body: z.object(contactShape) });
export const contactUpdateSchema = envelope({
  params: idParams,
  body: z.object(contactShape).partial().refine((value) => Object.keys(value).length > 0, "Completează un câmp de actualizat."),
});
export const contactListSchema = envelope({
  query: z.object({
    q: z.string().trim().max(80).optional(),
    category: z.enum(CONTACT_CATEGORIES).optional(),
    enabled: z.enum(["true", "false"]).optional(),
    aiEnabled: z.enum(["true", "false"]).optional(),
  }),
});

export const ruleCreateSchema = envelope({ body: withRuleChecks(z.object(ruleShape)) });
export const ruleUpdateSchema = envelope({
  params: idParams,
  body: z
    .object({
      ...ruleShape,
      name: shortText(80).optional(),
      priority: z.number().int().min(0).max(1000).optional(),
      matchType: z.enum(MATCH_TYPES).optional(),
      action: z.enum(RULE_ACTIONS).optional(),
    })
    .partial()
    .refine((value) => Object.keys(value).length > 0, "Completează un câmp de actualizat."),
});

export const ruleTestSchema = envelope({
  body: z.object({
    phoneNumber: z.string().trim().min(3).max(32),
    at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Dată invalidă.").optional(),
  }),
});

export const callListSchema = envelope({
  query: z.object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(CALL_STATUSES).optional(),
    aiHandled: z.enum(["true", "false"]).optional(),
    actionRequired: z.enum(["true", "false"]).optional(),
    includeSimulated: z.enum(["true", "false"]).optional(),
    from: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Dată invalidă.").optional(),
    to: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Dată invalidă.").optional(),
    sort: z.enum(["startedAt", "duration", "status"]).optional(),
    page: wholeQuery(1, 1000, 1),
    limit: wholeQuery(1, 100, 20),
  }),
});

export const callFlagSchema = envelope({
  params: idParams,
  body: z.object({
    read: z.boolean().optional(),
    attentionResolved: z.boolean().optional(),
  }),
});

export const transferSchema = envelope({
  params: idParams,
  body: z.object({ targetNumber: z.string().trim().min(3).max(32) }),
});

export const settingsSchema = envelope({
  body: z.object(settingsShape).refine((value) => Object.keys(value).length > 0, "Completează o setare de actualizat."),
});

export const simulateSchema = envelope({
  body: z.object({ phoneNumber: z.string().trim().min(3).max(32) }),
});

export const aiToggleSchema = envelope({
  body: z.object({ aiAnsweringEnabled: z.boolean() }),
});

export const assistantSchema = envelope({
  body: z.object({
    assistantName: shortText(40).optional(),
    ownerName: shortText(80).optional(),
    greeting: z.string().trim().min(1).max(300).optional(),
    customSystemPrompt: z.string().trim().max(8000).optional(),
  }),
});

export const previewSchema = envelope({
  body: z.object({ contactId: z.string().min(1).optional() }),
});

export const voiceSchema = envelope({
  body: z.object({
    maxCallDurationSeconds: z.number().int().min(30).max(7200).optional(),
    responseTimeoutMs: z.number().int().min(1000).max(60000).optional(),
    silenceMs: z.number().int().min(200).max(5000).optional(),
  }),
});

export const notificationListSchema = envelope({
  query: z.object({
    unread: z.enum(["true", "false"]).optional(),
    page: wholeQuery(1, 1000, 1),
    limit: wholeQuery(1, 100, 20),
  }),
});

export const deviceSchema = envelope({
  body: z.object({ token: z.string().trim().min(10).max(4096) }),
});

export const idSchema = envelope({ params: idParams });
