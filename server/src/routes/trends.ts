import type { FastifyInstance } from "fastify";
import { requireUser } from "../plugins/auth.js";
import { todayIso } from "../domain/dates.js";
import { groupByMonth, parsePeriod, parseYear } from "../domain/trends.js";
import { loadTrends, loadYearBook } from "../queries/trends.js";
import { attachmentUrls } from "./attachment-urls.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function trendsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser);

  app.get<{ Querystring: { childId?: string; period?: string } }>(
    "/api/trends",
    async (req, reply) => {
      const childId = req.query.childId;
      if (!childId || !UUID_RE.test(childId))
        return reply.code(400).send({ error: "enfant manquant" });
      const res = await loadTrends({
        userId: req.user!.id,
        childId,
        period: parsePeriod(req.query.period),
        today: todayIso(),
      });
      if (res.kind === "denied")
        return reply.code(403).send({ error: "accès refusé à cet enfant" });
      return {
        child: res.child,
        period: res.period,
        years: res.years,
        trends: res.trends,
      };
    },
  );

  app.get<{ Querystring: { childId?: string; annee?: string } }>(
    "/api/book",
    async (req, reply) => {
      const childId = req.query.childId;
      if (!childId || !UUID_RE.test(childId))
        return reply.code(400).send({ error: "enfant manquant" });
      const res = await loadYearBook({
        userId: req.user!.id,
        childId,
        year: parseYear(req.query.annee, Number(todayIso().slice(0, 4))),
      });
      if (res.kind === "denied")
        return reply.code(403).send({ error: "accès refusé à cet enfant" });
      return {
        child: res.child,
        year: res.year,
        years: res.years,
        months: groupByMonth(
          res.entries.map(({ attachments, ...e }) => ({
            ...e,
            photos: attachments.map((a) => ({
              id: a.id,
              width: a.width,
              height: a.height,
              ...attachmentUrls(a),
            })),
          })),
        ),
      };
    },
  );
}
