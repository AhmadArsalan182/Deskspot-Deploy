import prisma from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";
import { serializeNotification } from "../domain/serializers.js";
import { paginationMeta, parsePagination } from "../lib/pagination.js";

export async function listNotifications(req, res) {
  const { page, pageSize } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 50 });

  const [total, unreadCount, rows] = await prisma.$transaction([
    prisma.notification.count({ where: { userId: req.user.id } }),
    prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
    prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({
    items: rows.map(serializeNotification),
    unreadCount,
    pagination: paginationMeta({ total, page, pageSize }),
  });
}

export async function markAllRead(req, res) {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}

export async function markRead(req, res) {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!notification) throw notFound("Notification not found.");
  await prisma.notification.update({
    where: { id: notification.id },
    data: { readAt: notification.readAt ?? new Date() },
  });
  res.json({ ok: true });
}
