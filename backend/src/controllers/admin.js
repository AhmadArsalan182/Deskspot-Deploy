import {
  getAdminOverview,
  getDailyOccupancy,
  getUsageStatistics,
} from "../services/insightsService.js";
import {
  occupancyQuerySchema,
  overviewQuerySchema,
  statisticsQuerySchema,
} from "../validation/schemas.js";

/** Everything the admin landing dashboard renders, in a single round trip. */
export async function overview(req, res) {
  const query = overviewQuerySchema.parse(req.query);
  const result = await getAdminOverview({ windowDays: query.days });
  res.json(result);
}

export async function occupancy(req, res) {
  const query = occupancyQuerySchema.parse(req.query);
  const result = await getDailyOccupancy({ officeId: query.officeId, date: query.date });
  res.json(result);
}

export async function statistics(req, res) {
  const query = statisticsQuerySchema.parse(req.query);
  const result = await getUsageStatistics({ days: query.days ?? 7 });
  res.json(result);
}
