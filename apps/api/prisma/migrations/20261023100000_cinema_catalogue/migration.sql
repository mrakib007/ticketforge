CREATE TYPE "ScreeningStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

CREATE TABLE "Cinema" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "imageUrl" TEXT,
  "isDemo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cinema_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Movie" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "synopsis" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "posterUrl" TEXT,
  "releaseDate" DATE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Movie_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Movie_durationMinutes_check" CHECK ("durationMinutes" > 0)
);

CREATE TABLE "Auditorium" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cinemaId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Auditorium_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Auditorium_cinemaId_name_key" UNIQUE ("cinemaId", "name"),
  CONSTRAINT "Auditorium_cinemaId_fkey" FOREIGN KEY ("cinemaId") REFERENCES "Cinema"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Seat" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "auditoriumId" UUID NOT NULL,
  "rowLabel" TEXT NOT NULL,
  "seatNumber" INTEGER NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'STANDARD',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Seat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Seat_auditoriumId_rowLabel_seatNumber_key" UNIQUE ("auditoriumId", "rowLabel", "seatNumber"),
  CONSTRAINT "Seat_seatNumber_check" CHECK ("seatNumber" > 0),
  CONSTRAINT "Seat_auditoriumId_fkey" FOREIGN KEY ("auditoriumId") REFERENCES "Auditorium"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Screening" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "movieId" UUID NOT NULL,
  "auditoriumId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "bookingClosesAt" TIMESTAMPTZ(3) NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" "ScreeningStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Screening_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Screening_time_check" CHECK ("endsAt" > "startsAt" AND "bookingClosesAt" <= "startsAt"),
  CONSTRAINT "Screening_price_check" CHECK ("priceMinor" >= 0 AND "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Screening_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Screening_auditoriumId_fkey" FOREIGN KEY ("auditoriumId") REFERENCES "Auditorium"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Screening_auditoriumId_startsAt_idx" ON "Screening"("auditoriumId", "startsAt");
CREATE INDEX "Screening_status_startsAt_idx" ON "Screening"("status", "startsAt");

-- PostgreSQL enforces this even when two writers insert simultaneously. Adjacent
-- [start, end) slots are allowed; cancelled screenings do not block a slot.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Screening" ADD CONSTRAINT "Screening_auditorium_time_excl"
  EXCLUDE USING gist ("auditoriumId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" <> 'CANCELLED');
