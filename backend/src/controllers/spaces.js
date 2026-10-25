import prisma from "../lib/prisma.js";
import { conflict, notFound } from "../lib/errors.js";
import { serializeSpace } from "../domain/serializers.js";
import { spaceCreateSchema, spacesQuerySchema, spaceUpdateSchema } from "../validation/schemas.js";

async function querySpaces({ officeId, type, includeInactive, role }) {
  const spaces = await prisma.space.findMany({
    where: {
      ...(officeId ? { officeId } : {}),
      ...(type ? { type } : {}),
      ...(includeInactive && role === "ADMIN" ? {} : { isActive: true }),
    },
    include: { office: true },
    orderBy: [{ office: { name: "asc" } }, { type: "asc" }, { name: "asc" }],
  });
  return spaces.map(serializeSpace);
}

export async function listSpaces(req, res) {
  const { officeId, type, includeInactive } = spacesQuerySchema.parse(req.query);
  res.json({ items: await querySpaces({ officeId, type, includeInactive, role: req.user.role }) });
}

/** GET /api/offices/:id/spaces */
export async function listSpacesForOffice(req, res) {
  const { type, includeInactive } = spacesQuerySchema.parse(req.query);
  res.json({
    items: await querySpaces({ officeId: req.params.id, type, includeInactive, role: req.user.role }),
  });
}

export async function createSpace(req, res) {
  const data = spaceCreateSchema.parse(req.body);
  const office = await prisma.office.findUnique({ where: { id: data.officeId } });
  if (!office) throw notFound("Office not found.");

  const space = await prisma.space.create({ data, include: { office: true } });
  res.status(201).json(serializeSpace(space));
}

export async function updateSpace(req, res) {
  const data = spaceUpdateSchema.parse(req.body);
  if (data.officeId) {
    const office = await prisma.office.findUnique({ where: { id: data.officeId } });
    if (!office) throw notFound("Office not found.");
  }
  const space = await prisma.space.update({
    where: { id: req.params.id },
    data,
    include: { office: true },
  });
  res.json(serializeSpace(space));
}

export async function deleteSpace(req, res) {
  const bookingCount = await prisma.booking.count({ where: { spaceId: req.params.id } });
  if (bookingCount > 0) {
    throw conflict(
      "SPACE_HAS_BOOKINGS",
      `This space has ${bookingCount} booking(s). Deactivate it instead to keep the history.`,
    );
  }
  await prisma.space.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
