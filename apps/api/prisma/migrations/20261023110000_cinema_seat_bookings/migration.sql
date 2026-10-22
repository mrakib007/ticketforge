CREATE TABLE "CinemaBooking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "screeningId" UUID NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CinemaBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CinemaBooking_userId_idempotencyKey_key" UNIQUE ("userId", "idempotencyKey"),
  CONSTRAINT "CinemaBooking_id_userId_screeningId_key" UNIQUE ("id", "userId", "screeningId"),
  CONSTRAINT "CinemaBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CinemaBooking_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "Screening"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CinemaBooking_userId_screeningId_idx" ON "CinemaBooking"("userId", "screeningId");

CREATE TABLE "CinemaBookingSeat" (
  "bookingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "screeningId" UUID NOT NULL,
  "seatId" UUID NOT NULL,
  CONSTRAINT "CinemaBookingSeat_pkey" PRIMARY KEY ("bookingId", "seatId"),
  CONSTRAINT "CinemaBookingSeat_screeningId_seatId_key" UNIQUE ("screeningId", "seatId"),
  CONSTRAINT "CinemaBookingSeat_bookingId_userId_screeningId_fkey" FOREIGN KEY ("bookingId", "userId", "screeningId") REFERENCES "CinemaBooking"("id", "userId", "screeningId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CinemaBookingSeat_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "Screening"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CinemaBookingSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CinemaBookingSeat_userId_screeningId_idx" ON "CinemaBookingSeat"("userId", "screeningId");

-- Serialize all claims by one person through their User row, even when they
-- book different seats in concurrent requests or through another DB client.
-- The unique (screeningId, seatId) index independently prevents double sales.
CREATE FUNCTION cinema_booking_seat_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  active_count integer;
BEGIN
  PERFORM 1 FROM "User" WHERE "id" = NEW."userId" FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM "Screening" sc
    JOIN "Seat" s ON s."auditoriumId" = sc."auditoriumId"
    WHERE sc."id" = NEW."screeningId" AND s."id" = NEW."seatId"
      AND s."isActive" AND sc."status" = 'PUBLISHED'
      AND sc."bookingClosesAt" > clock_timestamp()
      AND sc."startsAt" > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'Cinema screening closed or seat invalid' USING ERRCODE = '23514', CONSTRAINT = 'CinemaBookingSeat_eligible_check';
  END IF;
  SELECT count(*) INTO active_count FROM "CinemaBookingSeat"
    WHERE "userId" = NEW."userId" AND "screeningId" = NEW."screeningId";
  IF active_count >= 10 THEN
    RAISE EXCEPTION 'Cinema screening ticket limit exceeded' USING ERRCODE = '23514', CONSTRAINT = 'CinemaBookingSeat_limit_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cinema_booking_seat_guard BEFORE INSERT ON "CinemaBookingSeat"
FOR EACH ROW EXECUTE FUNCTION cinema_booking_seat_guard();
