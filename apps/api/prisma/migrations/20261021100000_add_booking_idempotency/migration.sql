-- Nullable so bookings created before this migration remain intact.
ALTER TABLE "Booking" ADD COLUMN "idempotencyKey" UUID;
CREATE UNIQUE INDEX "Booking_userId_idempotencyKey_key" ON "Booking"("userId", "idempotencyKey");
