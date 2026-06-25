import { useEffect, useState } from "react";

interface Application {
  id: number;
  name: string;
  cycle_interval_min: number;
  paused: number;
}

interface Incident {
  id: number;
  kind: string;
  status: string;
  opened_at: string;
}

export function App() {
  const [apps, setApps] = useState<Application[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    fetch("/api/applications").then((r) => r.json()).then(setApps);
    fetch("/api/incidents").then((r) => r.json()).then(setIncidents);
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>🌋 Sismógrafo</h1>
      <p>Monitoramento de aplicações web — livro de sintomas e diagnósticos.</p>

      <section>
        <h2>Aplicações</h2>
        {apps.length === 0 ? (
          <p>Nenhuma Aplicação cadastrada ainda.</p>
        ) : (
          <ul>
            {apps.map((a) => (
              <li key={a.id}>
                {a.name} — Ciclo a cada {a.cycle_interval_min} min {a.paused ? "(pausada)" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Incidentes</h2>
        {incidents.length === 0 ? (
          <p>Sem Incidentes. O chão está estável. 🌱</p>
        ) : (
          <ul>
            {incidents.map((i) => (
              <li key={i.id}>
                #{i.id} [{i.kind}] {i.status} — aberto em {i.opened_at}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
