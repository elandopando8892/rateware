export function RoutePlaceholder() {
  return (
    <section className="route-placeholder" aria-labelledby="unavailable-title">
      <p className="eyebrow">OSP</p>
      <h1 id="unavailable-title">Page unavailable</h1>
      <p>This address is not part of the read-only onboarding workspace.</p>
      <Link to="/app/pipeline">Return to pipeline</Link>
    </section>
  );
}
import { Link } from '@tanstack/react-router';
