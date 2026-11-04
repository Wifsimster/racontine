import type { FastifyInstance } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { hasChildRole } from "../access.js";
import {
  isReminderTime,
  normalizeReminderDays,
} from "../domain/capture-reminder.js";
import {
  listReminderPreferences,
  saveReminderPreference,
  type ReminderPreferencePatch,
} from "../notifications/capture-reminder-store.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function captureRemindersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get("/api/me/capture-reminders", async (req) => ({
    reminders: await listReminderPreferences(req.user!.id),
  }));

  app.put<{
    Params: { childId: string };
    Body: { enabled?: unknown; time?: unknown; days?: unknown };
  }>("/api/me/capture-reminders/:childId", async (req, reply) => {
    const body = req.body ?? {};
    const patch: ReminderPreferencePatch = {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean")
        return reply.code(400).send({ error: "enabled invalide" });
      patch.enabled = body.enabled;
    }
    if (body.time !== undefined) {
      if (!isReminderTime(body.time))
        return reply.code(400).send({ error: "heure invalide (HH:MM)" });
      patch.time = body.time;
    }
    if (body.days !== undefined) {
      const days = normalizeReminderDays(body.days);
      if (!days) return reply.code(400).send({ error: "jours invalides" });
      patch.days = days;
    }
    if (
      !UUID_RE.test(req.params.childId) ||
      !(await hasChildRole(req.user!.id, req.params.childId, "contributor"))
    )
      return reply.code(404).send({ error: "enfant introuvable" });
    return saveReminderPreference(req.user!.id, req.params.childId, patch);
  });
}
