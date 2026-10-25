import prisma from "../lib/prisma.js";
import { conflict, notFound } from "../lib/errors.js";
import { serializeOffice } from "../domain/serializers.js";
import { officeCreateSchema, officeUpdateSchema } from "../validation/schemas.js";

export async function listOffices(req, res) {
  const offices = await prisma.office.findMany({
    include: { _count: { select: { spaces: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ items: offices.map(serializeOffice) });
}

export async function getOffice(req, res) {
  const office = await prisma.office.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { spaces: true } } },
  });
  if (!office) throw notFound("Office not found.");
  res.json(serializeOffice(office));
}

export async function createOffice(req, res) {
  const data = officeCreateSchema.parse(req.body);
  const office = await prisma.office.create({ data });
  res.status(201).json(serializeOffice(office));
}

export async function updateOffice(req, res) {
  const data = officeUpdateSchema.parse(req.body);
  const office = await prisma.office.update({ where: { id: req.params.id }, data });
  res.json(serializeOffice(office));
}

export async function deleteOffice(req, res) {
  const spaceCount = await prisma.space.count({ where: { officeId: req.params.id } });
  if (spaceCount > 0) {
    throw conflict(
      "OFFICE_HAS_SPACES",
      `This office still has ${spaceCount} space(s). Move or delete them first.`,
    );
  }
  await prisma.office.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
