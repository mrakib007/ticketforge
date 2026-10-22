import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/auth-api';
import { EventForm } from '../event-form';

export default async function NewOrganizerEvent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const token = (await cookies()).get('ticketforge_session')?.value;
  const user = token ? await currentUser(token) : null;
  if (!user) redirect('/login');
  if (user.role !== 'ORGANIZER') redirect('/account');
  const { error } = await searchParams;
  return (
    <main className="shell catalogue organizer-page">
      <nav className="catalogue-nav">
        <Link href="/organizer">← Your events</Link>
      </nav>
      <header className="catalogue-header">
        <span className="section-index">NEW EVENT</span>
        <h1>Create a draft.</h1>
      </header>
      {error && (
        <p role="alert">
          {error === 'invalid'
            ? 'Check all fields, dates and capacity.'
            : 'Could not create the event. Please try again.'}
        </p>
      )}
      <EventForm />
    </main>
  );
}
