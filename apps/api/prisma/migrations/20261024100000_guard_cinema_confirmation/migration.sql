-- Prevent editing/deleting seat/price history and serialize any seat insert
-- with confirmation. The confirmation guard also verifies count and total.
CREATE OR REPLACE FUNCTION cinema_hold_seat_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active_count integer;
BEGIN
  PERFORM 1 FROM "User" WHERE "id" = NEW."userId" FOR UPDATE;
  PERFORM 1 FROM "Seat" WHERE "id" = NEW."seatId" FOR UPDATE;
  PERFORM 1 FROM "CinemaHold" WHERE "id" = NEW."holdId" FOR UPDATE;
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

CREATE FUNCTION cinema_hold_seat_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Cinema hold selection is immutable' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHoldSeat_snapshot_check';
END;
$$;
CREATE TRIGGER cinema_hold_seat_snapshot_guard BEFORE UPDATE OR DELETE ON "CinemaHoldSeat"
  FOR EACH ROW EXECUTE FUNCTION cinema_hold_seat_snapshot_guard();

CREATE FUNCTION cinema_hold_confirmation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_count integer;
DECLARE selected_total bigint;
DECLARE selected_seat uuid;
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."screeningId" IS DISTINCT FROM OLD."screeningId"
    OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor" OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey" OR NEW."expiresAt" > OLD."expiresAt" THEN
    RAISE EXCEPTION 'Cinema hold identity, price and expiry cannot change' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHold_snapshot_check';
  END IF;
  IF OLD."status" = 'CONFIRMED' AND NEW."status" <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'Confirmed seats cannot be released' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHold_confirm_check';
  END IF;
  IF NEW."status" <> 'CONFIRMED' OR OLD."status" = 'CONFIRMED' THEN
    RETURN NEW;
  END IF;
  IF OLD."status" NOT IN ('HOLDING', 'PAYMENT_FAILED') OR OLD."expiresAt" <= clock_timestamp()
    OR NEW."expiresAt" <> OLD."expiresAt" OR NEW."totalMinor" <> OLD."totalMinor"
    OR NEW."currency" <> OLD."currency" OR NEW."userId" <> OLD."userId"
    OR NEW."screeningId" <> OLD."screeningId" THEN
    RAISE EXCEPTION 'Cinema hold expired or invalid' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHold_confirm_check';
  END IF;
  SELECT count(*), COALESCE(sum("priceMinor"), 0) INTO selected_count, selected_total
    FROM "CinemaHoldSeat" WHERE "holdId" = OLD."id";
  IF selected_count < 1 OR selected_count > 10 OR selected_total <> OLD."totalMinor" THEN
    RAISE EXCEPTION 'Cinema hold selection incomplete' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHold_confirm_check';
  END IF;
  FOR selected_seat IN SELECT "seatId" FROM "CinemaHoldSeat" WHERE "holdId" = OLD."id" ORDER BY "seatId" LOOP
    PERFORM 1 FROM "Seat" WHERE "id" = selected_seat FOR UPDATE;
    IF EXISTS (SELECT 1 FROM "CinemaBookingSeat" WHERE "screeningId" = OLD."screeningId" AND "seatId" = selected_seat)
      OR EXISTS (
        SELECT 1 FROM "CinemaHoldSeat" hs JOIN "CinemaHold" h ON h."id" = hs."holdId"
        WHERE hs."screeningId" = OLD."screeningId" AND hs."seatId" = selected_seat AND hs."holdId" <> OLD."id"
          AND (h."status" = 'CONFIRMED' OR (h."status" IN ('HOLDING', 'PAYMENT_FAILED') AND h."expiresAt" > clock_timestamp()))
      ) THEN
      RAISE EXCEPTION 'Cinema hold no longer owns all seats' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHold_confirm_check';
    END IF;
  END LOOP;
  IF OLD."expiresAt" <= clock_timestamp() THEN
    RAISE EXCEPTION 'Cinema hold expired while confirming' USING ERRCODE = '23514', CONSTRAINT = 'CinemaHold_confirm_check';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cinema_hold_confirmation_guard BEFORE UPDATE ON "CinemaHold"
  FOR EACH ROW EXECUTE FUNCTION cinema_hold_confirmation_guard();
