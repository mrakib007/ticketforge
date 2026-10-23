CREATE TYPE "CinemaHoldStatus" AS ENUM ('HOLDING', 'EXPIRED', 'PAYMENT_FAILED', 'CONFIRMED', 'PAID_UNFULFILLED');

CREATE TABLE "CinemaHold" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "screeningId" UUID NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "status" "CinemaHoldStatus" NOT NULL DEFAULT 'HOLDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  CONSTRAINT "CinemaHold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CinemaHold_userId_idempotencyKey_key" UNIQUE ("userId", "idempotencyKey"),
  CONSTRAINT "CinemaHold_id_userId_screeningId_key" UNIQUE ("id", "userId", "screeningId"),
  CONSTRAINT "CinemaHold_amount_check" CHECK ("totalMinor" >= 0 AND "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "CinemaHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CinemaHold_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "Screening"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CinemaHold_userId_screeningId_idx" ON "CinemaHold"("userId", "screeningId");
CREATE INDEX "CinemaHold_status_expiresAt_idx" ON "CinemaHold"("status", "expiresAt");

CREATE TABLE "CinemaHoldSeat" (
  "holdId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "screeningId" UUID NOT NULL,
  "seatId" UUID NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  CONSTRAINT "CinemaHoldSeat_pkey" PRIMARY KEY ("holdId", "seatId"),
  CONSTRAINT "CinemaHoldSeat_price_check" CHECK ("priceMinor" >= 0),
  CONSTRAINT "CinemaHoldSeat_holdId_userId_screeningId_fkey" FOREIGN KEY ("holdId", "userId", "screeningId") REFERENCES "CinemaHold"("id", "userId", "screeningId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CinemaHoldSeat_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "Screening"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CinemaHoldSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CinemaHoldSeat_screeningId_seatId_idx" ON "CinemaHoldSeat"("screeningId", "seatId");
CREATE INDEX "CinemaHoldSeat_userId_screeningId_idx" ON "CinemaHoldSeat"("userId", "screeningId");

-- The existing free bookings are confirmed forever. Their unique seat index
-- remains intact. Both claim paths serialize on the physical Seat row; the
-- user lock is taken first so cap checks serialize across separate seats.
CREATE OR REPLACE FUNCTION cinema_booking_seat_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active_count integer;
BEGIN
  PERFORM 1 FROM "User" WHERE "id" = NEW."userId" FOR UPDATE;
  PERFORM 1 FROM "Seat" WHERE "id" = NEW."seatId" FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM "Screening" sc JOIN "Seat" s ON s."auditoriumId" = sc."auditoriumId"
    WHERE sc."id" = NEW."screeningId" AND s."id" = NEW."seatId"
      AND s."isActive" AND sc."status" = 'PUBLISHED'
      AND sc."bookingClosesAt" > clock_timestamp() AND sc."startsAt" > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'Cinema screening closed or seat invalid' USING ERRCODE = '23514', CONSTRAINT = 'CinemaBookingSeat_eligible_check';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "CinemaHoldSeat" hs JOIN "CinemaHold" h ON h."id" = hs."holdId"
    WHERE hs."screeningId" = NEW."screeningId" AND hs."seatId" = NEW."seatId"
      AND (h."status" = 'CONFIRMED' OR (h."status" IN ('HOLDING', 'PAYMENT_FAILED') AND h."expiresAt" > clock_timestamp()))
  ) THEN
    RAISE EXCEPTION 'Cinema seat held' USING ERRCODE = '23514', CONSTRAINT = 'CinemaBookingSeat_eligible_check';
  END IF;
  SELECT (SELECT count(*) FROM "CinemaBookingSeat" WHERE "userId" = NEW."userId" AND "screeningId" = NEW."screeningId")
       + (SELECT count(*) FROM "CinemaHoldSeat" hs JOIN "CinemaHold" h ON h."id" = hs."holdId"
          WHERE hs."userId" = NEW."userId" AND hs."screeningId" = NEW."screeningId"
            AND (h."status" = 'CONFIRMED' OR (h."status" IN ('HOLDING', 'PAYMENT_FAILED') AND h."expiresAt" > clock_timestamp())))
    INTO active_count;
  IF active_count >= 10 THEN
    RAISE EXCEPTION 'Cinema screening ticket limit exceeded' USING ERRCODE = '23514', CONSTRAINT = 'CinemaBookingSeat_limit_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION cinema_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'HOLDING' OR NOT EXISTS (
    SELECT 1 FROM "Screening" sc WHERE sc."id" = NEW."screeningId"
      AND sc."status" = 'PUBLISHED' AND sc."bookingClosesAt" > clock_timestamp()
      AND sc."startsAt" > clock_timestamp() AND NEW."expiresAt" <= sc."bookingClosesAt"
      AND NEW."expiresAt" > clock_timestamp()
      AND NEW."expiresAt" <= clock_timestamp() + interval '10 minutes'
      AND NEW."currency" = sc."currency"
  ) THEN
    RAISE EXCEPTION 'Cinema hold invalid or screening closed' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHold_eligible_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cinema_hold_guard BEFORE INSERT ON "CinemaHold" FOR EACH ROW EXECUTE FUNCTION cinema_hold_guard();

CREATE FUNCTION cinema_hold_seat_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active_count integer;
BEGIN
  PERFORM 1 FROM "User" WHERE "id" = NEW."userId" FOR UPDATE;
  PERFORM 1 FROM "Seat" WHERE "id" = NEW."seatId" FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM "CinemaHold" h JOIN "Screening" sc ON sc."id" = h."screeningId"
    JOIN "Seat" s ON s."auditoriumId" = sc."auditoriumId" AND s."id" = NEW."seatId"
    WHERE h."id" = NEW."holdId" AND h."screeningId" = NEW."screeningId"
      AND h."userId" = NEW."userId" AND h."status" = 'HOLDING'
      AND h."expiresAt" > clock_timestamp() AND sc."bookingClosesAt" > clock_timestamp()
      AND sc."status" = 'PUBLISHED' AND s."isActive" AND sc."priceMinor" = NEW."priceMinor"
  ) OR EXISTS (
    SELECT 1 FROM "CinemaBookingSeat" WHERE "screeningId" = NEW."screeningId" AND "seatId" = NEW."seatId"
  ) OR EXISTS (
    SELECT 1 FROM "CinemaHoldSeat" hs JOIN "CinemaHold" h ON h."id" = hs."holdId"
    WHERE hs."screeningId" = NEW."screeningId" AND hs."seatId" = NEW."seatId"
      AND (h."status" = 'CONFIRMED' OR (h."status" IN ('HOLDING', 'PAYMENT_FAILED') AND h."expiresAt" > clock_timestamp()))
  ) THEN
    RAISE EXCEPTION 'Cinema seat unavailable' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHoldSeat_eligible_check';
  END IF;
  SELECT (SELECT count(*) FROM "CinemaBookingSeat" WHERE "userId" = NEW."userId" AND "screeningId" = NEW."screeningId")
       + (SELECT count(*) FROM "CinemaHoldSeat" hs JOIN "CinemaHold" h ON h."id" = hs."holdId"
          WHERE hs."userId" = NEW."userId" AND hs."screeningId" = NEW."screeningId"
            AND (h."status" = 'CONFIRMED' OR (h."status" IN ('HOLDING', 'PAYMENT_FAILED') AND h."expiresAt" > clock_timestamp())))
    INTO active_count;
  IF active_count >= 10 THEN
    RAISE EXCEPTION 'Cinema screening ticket limit exceeded' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHoldSeat_limit_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cinema_hold_seat_guard BEFORE INSERT ON "CinemaHoldSeat" FOR EACH ROW EXECUTE FUNCTION cinema_hold_seat_guard();
