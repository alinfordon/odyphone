import { getEnv } from "../config/env.js";
import { Notification } from "../models/Notification.js";
import { deliverPush } from "../notifications/fcm.js";
import { notFound } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";
import { readPage } from "../utils/http.js";

export function fcmStatus() {
  const env = getEnv();
  const configured = Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
  return {
    configured,
    delivered: false,
    detail: configured
      ? "Datele de acces Firebase sunt prezente. Push-ul pleacă doar către dispozitivele înregistrate."
      : "Datele de acces Firebase nu sunt configurate. Notificările rămân în centrul intern.",
  };
}

export async function createNotification(userId, { type, title, body, callId = null }) {
  const notification = await Notification.create({
    userId,
    type,
    title,
    body,
    callId,
    delivery: {
      internal: "stored",
      fcm: "pending",
      fcmDetail: "",
    },
  });
  const push = await deliverPush({
    userId,
    title,
    body,
    data: { type, notificationId: String(notification._id), callId: callId ? String(callId) : "" },
  }).catch(() => ({
    state: "failed",
    detail: "Livrarea push a eșuat. Notificarea rămâne în centru.",
  }));
  notification.delivery.fcm = push.state;
  notification.delivery.fcmDetail = push.detail;
  await notification.save();
  return notification.toPublic();
}

export async function listNotifications(userId, query) {
  const { page, limit, skip } = readPage(query);
  const filter = { userId };
  if (query.unread === "true") filter.read = false;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, read: false }),
  ]);
  return {
    items: items.map((item) => item.toPublic()),
    meta: { page, limit, total, pages: total === 0 ? 0 : Math.ceil(total / limit), unread },
    fcm: fcmStatus(),
  };
}

export async function markNotificationRead(userId, id) {
  assertObjectId(id, "notification id");
  const notification = await Notification.findOne({ _id: id, userId });
  if (!notification) throw notFound("Notificarea nu a fost găsită.");
  notification.read = true;
  notification.readAt = new Date();
  await notification.save();
  return notification.toPublic();
}

export async function markAllRead(userId) {
  await Notification.updateMany({ userId, read: false }, { $set: { read: true, readAt: new Date() } });
  return { updated: true };
}
