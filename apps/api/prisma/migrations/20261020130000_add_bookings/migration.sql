ALTER TABLE "Event" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD COLUMN "bookedSeats" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD CONSTRAINT "Event_capacity_check" CHECK ("capacity" >= 0 AND "bookedSeats" >= 0 AND "bookedSeats" <= "capacity");

CREATE TABLE "Booking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_quantity_check" CHECK ("quantity" BETWEEN 1 AND 10),
  CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");
CREATE INDEX "Booking_eventId_idx" ON "Booking"("eventId");
