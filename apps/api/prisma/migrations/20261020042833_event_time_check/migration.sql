ALTER TABLE "Event"
ADD CONSTRAINT "Event_ends_after_starts" CHECK ("endsAt" > "startsAt");
