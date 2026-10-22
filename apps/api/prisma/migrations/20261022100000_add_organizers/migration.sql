CREATE TYPE "UserRole" AS ENUM ('ATTENDEE', 'ORGANIZER');
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'ATTENDEE';
ALTER TABLE "Event" ADD COLUMN "organizerId" UUID;
CREATE INDEX "Event_organizerId_startsAt_idx" ON "Event"("organizerId", "startsAt");
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
