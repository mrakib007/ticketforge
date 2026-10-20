import Link from 'next/link';
import { fetchApiHealth } from '../lib/api-health';
import { AuthNavigation } from './auth/navigation';

export const dynamic = 'force-dynamic';

const principles = [
  {
    number: '01',
    title: 'One source of truth',
    description:
      'PostgreSQL owns inventory and bookings. Every other system supports it.',
  },
  {
    number: '02',
    title: 'Health before features',
    description:
      'Liveness checks the process; readiness checks the database connection.',
  },
  {
    number: '03',
    title: 'Built to evolve',
    description:
      'Redis and Kafka are ready locally, but stay out of the request path for now.',
  },
];

export default async function Home() {
  const status = await fetchApiHealth();
  const healthy = status === 'ok';

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="TicketForge home">
          <span className="brand-mark">
            T<span>F</span>
          </span>
          <span>
            ticketforge<span className="brand-dot">.</span>
          </span>
        </Link>
        <AuthNavigation />
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="eyebrow">
          <span className="eyebrow-line" /> THE FOUNDATION
        </div>
        <h1 id="hero-title">
          Built for the
          <br />
          <em>moment it matters.</em>
        </h1>
        <p className="hero-description">
          A ticketing platform designed from the database outward. We&apos;re
          starting with the foundation: clear boundaries, honest health checks,
          and infrastructure you can run yourself.
        </p>
        <div className="hero-meta">
          <span>MONOREPO / v0.1</span>
          <span>FASTIFY + NEXT.JS</span>
          <span>LOCAL-FIRST</span>
        </div>
        <Link className="event-link home-event-link" href="/events">
          Explore upcoming events →
        </Link>
      </section>

      <section className="status-section" aria-labelledby="status-title">
        <div className="section-heading">
          <span className="section-index">01 / SYSTEM STATUS</span>
          <h2 id="status-title">The pulse of the platform</h2>
        </div>
        <div className="status-card">
          <div className="status-left">
            <div
              className={`status-indicator ${healthy ? 'is-healthy' : 'is-down'}`}
              aria-hidden="true"
            >
              <span />
            </div>
            <div>
              <span className="status-label">API + DATABASE READINESS</span>
              <h3>
                {healthy ? 'All systems operational' : 'Backend unavailable'}
              </h3>
              <p>
                {healthy
                  ? 'The API is connected to PostgreSQL and ready to serve requests.'
                  : 'Start Docker services and the API, then refresh this page.'}
              </p>
            </div>
          </div>
          <span
            className={`status-badge ${healthy ? 'badge-ok' : 'badge-down'}`}
          >
            {healthy ? 'READY' : 'NOT READY'}
          </span>
        </div>
        <p className="status-footnote">
          Checked live on every page request · No database credentials reach
          your browser
        </p>
      </section>

      <section className="principles" aria-labelledby="principles-title">
        <div className="section-heading">
          <span className="section-index">02 / THE APPROACH</span>
          <h2 id="principles-title">Small start. Strong bones.</h2>
        </div>
        <div className="principle-grid">
          {principles.map((item) => (
            <article className="principle" key={item.number}>
              <span className="principle-number">{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
      <footer>
        <span>© TICKETFORGE</span>
        <span>EVENTS & ACCOUNTS</span>
      </footer>
    </main>
  );
}
