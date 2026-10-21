import type { PublicBooking } from '@ticketforge/contracts';

export function canCancelBooking(
  booking: PublicBooking,
  now = Date.now(),
): boolean {
  return (
    booking.cancelledAt === null && Date.parse(booking.event.startsAt) > now
  );
}

export function cancellationNotice(status: string | undefined): string | null {
  switch (status) {
    case 'ok':
      return 'Booking cancelled. Your seats have been released.';
    case 'too-late':
      return 'This event has started; cancellation is no longer available.';
    case 'not-found':
      return 'Booking not found.';
    case 'unauthorized':
      return 'Your session has expired. Please sign in again.';
    case 'unavailable':
      return 'Cancellation is temporarily unavailable. Please try again.';
    default:
      return null;
  }
}
