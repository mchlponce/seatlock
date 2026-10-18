import { useEffect, useState } from 'react';

type Event = { id: string; name: string; startsAt: string };

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

/** Placeholder UI: lists events. The seat map comes in a later step. */
export function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    gql<{ events: Event[] }>('{ events { id name startsAt } }')
      .then((d) => setEvents(d.events))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Seatlock</h1>
      {error && <p role="alert">Couldn't load events: {error}</p>}
      <ul>
        {events.map((e) => (
          <li key={e.id}>
            {e.name} · {new Date(e.startsAt).toLocaleDateString()}
          </li>
        ))}
      </ul>
    </main>
  );
}
