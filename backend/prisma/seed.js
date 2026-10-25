/**
 * Idempotent seed data: three offices, their desks and rooms, one admin and two
 * employees, plus a couple of demo bookings for today so the admin views have
 * something to show. Safe to run repeatedly.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDaysToDayKey, localDayKey, localDateTimeToUtc } from "../src/lib/timezone.js";

const prisma = new PrismaClient();

const OFFICES = [
  {
    name: "Islamabad HQ",
    city: "Islamabad",
    timezone: "Asia/Karachi",
    spaces: [
      { name: "Desk A1", type: "DESK", capacity: 1 },
      { name: "Desk A2", type: "DESK", capacity: 1 },
      { name: "Desk A3", type: "DESK", capacity: 1 },
      { name: "Desk A4", type: "DESK", capacity: 1 },
      { name: "Focus Room 1", type: "ROOM", capacity: 4 },
      { name: "Boardroom", type: "ROOM", capacity: 12 },
    ],
  },
  {
    name: "Riyadh Office",
    city: "Riyadh",
    timezone: "Asia/Riyadh",
    spaces: [
      { name: "Desk R1", type: "DESK", capacity: 1 },
      { name: "Desk R2", type: "DESK", capacity: 1 },
      { name: "Desk R3", type: "DESK", capacity: 1 },
      { name: "Meeting Room North", type: "ROOM", capacity: 6 },
      { name: "Meeting Room South", type: "ROOM", capacity: 8 },
    ],
  },
  {
    name: "Copenhagen Studio",
    city: "Copenhagen",
    timezone: "Europe/Copenhagen",
    spaces: [
      { name: "Desk C1", type: "DESK", capacity: 1 },
      { name: "Desk C2", type: "DESK", capacity: 1 },
      { name: "Desk C3", type: "DESK", capacity: 1 },
      { name: "Workshop Room", type: "ROOM", capacity: 10 },
      { name: "Quiet Booth", type: "ROOM", capacity: 2 },
    ],
  },
];

const USERS = [
  { email: "admin@deskspot.test", password: "Admin123!", fullName: "Amina Admin", role: "ADMIN" },
  { email: "employee@deskspot.test", password: "Employee123!", fullName: "Elias Employee", role: "EMPLOYEE" },
  { email: "sara@deskspot.test", password: "Employee123!", fullName: "Sara Sattar", role: "EMPLOYEE" },
];

async function seedUsers() {
  const users = {};
  for (const account of USERS) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { fullName: account.fullName, role: account.role, passwordHash },
      create: {
        email: account.email,
        passwordHash,
        fullName: account.fullName,
        role: account.role,
      },
    });
    users[account.role === "ADMIN" ? "admin" : account.email.split("@")[0]] = user;
  }
  return users;
}

async function seedOffices() {
  const offices = [];
  for (const definition of OFFICES) {
    const existing = await prisma.office.findFirst({ where: { name: definition.name } });
    const office = existing
      ? await prisma.office.update({
          where: { id: existing.id },
          data: { city: definition.city, timezone: definition.timezone },
        })
      : await prisma.office.create({
          data: { name: definition.name, city: definition.city, timezone: definition.timezone },
        });

    for (const space of definition.spaces) {
      await prisma.space.upsert({
        where: { officeId_name: { officeId: office.id, name: space.name } },
        update: { type: space.type, capacity: space.capacity, isActive: true },
        create: { ...space, officeId: office.id },
      });
    }
    offices.push(office);
  }
  return offices;
}

async function seedBookings(offices, users) {
  const existing = await prisma.booking.count();
  if (existing > 0) {
    console.log("Bookings already present — skipping demo bookings.");
    return;
  }

  const isb = offices.find((office) => office.timezone === "Asia/Karachi");
  const cph = offices.find((office) => office.timezone === "Europe/Copenhagen");

  const plans = [
    { office: isb, spaceName: "Desk A1", user: users.employee, dayOffset: 1, from: "09:00", to: "11:00", attendees: 1 },
    { office: isb, spaceName: "Boardroom", user: users.sara, dayOffset: 1, from: "13:00", to: "15:00", attendees: 6 },
    { office: cph, spaceName: "Desk C1", user: users.employee, dayOffset: 2, from: "10:00", to: "12:00", attendees: 1 },
  ];

  for (const plan of plans) {
    if (!plan.office) continue;
    const space = await prisma.space.findFirst({
      where: { officeId: plan.office.id, name: plan.spaceName },
    });
    if (!space) continue;

    const day = addDaysToDayKey(localDayKey(new Date(), plan.office.timezone), plan.dayOffset);
    await prisma.booking.create({
      data: {
        spaceId: space.id,
        userId: plan.user.id,
        startUtc: localDateTimeToUtc(day, plan.from, plan.office.timezone),
        endUtc: localDateTimeToUtc(day, plan.to, plan.office.timezone),
        attendees: plan.attendees,
      },
    });
  }
}

async function main() {
  const users = await seedUsers();
  const offices = await seedOffices();
  await seedBookings(offices, users);

  const [officeCount, spaceCount, userCount, bookingCount] = await Promise.all([
    prisma.office.count(),
    prisma.space.count(),
    prisma.user.count(),
    prisma.booking.count(),
  ]);

  console.log(
    `Seed complete: ${officeCount} offices, ${spaceCount} spaces, ${userCount} users, ${bookingCount} bookings.`,
  );
  console.log("Admin login:    admin@deskspot.test / Admin123!");
  console.log("Employee login: employee@deskspot.test / Employee123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
