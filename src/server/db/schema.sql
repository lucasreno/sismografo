-- Schema do Sismógrafo. SQL puro, sem ORM (ver docs/adr/0003).
-- Cada tabela mapeia um termo do CONTEXT.md.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Aplicação: o tipo de software monitorado. Define os Fluxos. Não tem URL.
CREATE TABLE IF NOT EXISTS application (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  cycle_interval_min    INTEGER NOT NULL DEFAULT 60,   -- cadência do Ciclo
  paused                INTEGER NOT NULL DEFAULT 0,
  pause_reason          TEXT,
  resume_at             TEXT,                          -- auto-retomar (ISO), opcional
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Instância: uma implantação concreta da Aplicação numa URL. O alvo medido.
CREATE TABLE IF NOT EXISTS instance (
  id                    INTEGER PRIMARY KEY,
  application_id        INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  url                   TEXT NOT NULL,
  auth_method           TEXT NOT NULL DEFAULT 'sessao-de-navegador', -- ou 'usuario-senha'
  session_status        TEXT NOT NULL DEFAULT 'none',  -- none | active | expired
  session_state_path    TEXT,                          -- storageState / perfil persistente
  paused                INTEGER NOT NULL DEFAULT 0,
  pause_reason          TEXT,
  resume_at             TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (application_id, name)
);

-- Fluxo: roteiro gravado de interações de navegador, definido na Aplicação.
CREATE TABLE IF NOT EXISTS flow (
  id                    INTEGER PRIMARY KEY,
  application_id        INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (application_id, name)
);

-- Passo: ação individual dentro de um Fluxo. Menor unidade que produz Medição.
CREATE TABLE IF NOT EXISTS step (
  id                    INTEGER PRIMARY KEY,
  flow_id               INTEGER NOT NULL REFERENCES flow(id) ON DELETE CASCADE,
  ordinal               INTEGER NOT NULL,
  kind                  TEXT NOT NULL,                 -- navigate | click | fill | wait | ...
  descriptor            TEXT NOT NULL DEFAULT '{}',    -- JSON: seletor, valor/param, etc.
  UNIQUE (flow_id, ordinal)
);

-- Parâmetro: input do Fluxo marcado como variável (valor vem da Calibração).
CREATE TABLE IF NOT EXISTS parameter (
  id                    INTEGER PRIMARY KEY,
  flow_id               INTEGER NOT NULL REFERENCES flow(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,                 -- ex.: 'competencia'
  secret                INTEGER NOT NULL DEFAULT 0,    -- 1 = vai pro chaveiro, não pro banco
  UNIQUE (flow_id, name)
);

-- Calibração: valores de Parâmetros para a combinação (Fluxo x Instância).
CREATE TABLE IF NOT EXISTS calibration (
  id                    INTEGER PRIMARY KEY,
  flow_id               INTEGER NOT NULL REFERENCES flow(id) ON DELETE CASCADE,
  instance_id           INTEGER NOT NULL REFERENCES instance(id) ON DELETE CASCADE,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (flow_id, instance_id)
);

CREATE TABLE IF NOT EXISTS calibration_value (
  calibration_id        INTEGER NOT NULL REFERENCES calibration(id) ON DELETE CASCADE,
  parameter_id          INTEGER NOT NULL REFERENCES parameter(id) ON DELETE CASCADE,
  value                 TEXT,                          -- segredos NÃO ficam aqui (chaveiro)
  PRIMARY KEY (calibration_id, parameter_id)
);

-- Ciclo de Monitoramento: passada completa, precedida de Verificação de Ambiente.
CREATE TABLE IF NOT EXISTS monitoring_cycle (
  id                    INTEGER PRIMARY KEY,
  application_id        INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  started_at            TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at           TEXT,
  status                TEXT NOT NULL DEFAULT 'running', -- running | ok | env_unavailable
  trigger               TEXT NOT NULL DEFAULT 'scheduled' -- scheduled | manual
);

-- Medição: sinais capturados ao executar um Passo. O sismograma bruto.
CREATE TABLE IF NOT EXISTS measurement (
  id                    INTEGER PRIMARY KEY,
  cycle_id              INTEGER NOT NULL REFERENCES monitoring_cycle(id) ON DELETE CASCADE,
  instance_id           INTEGER NOT NULL REFERENCES instance(id) ON DELETE CASCADE,
  flow_id               INTEGER NOT NULL REFERENCES flow(id) ON DELETE CASCADE,
  step_id               INTEGER NOT NULL REFERENCES step(id) ON DELETE CASCADE,
  captured_at           TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms           REAL,
  ttfb_ms               REAL,
  bytes                 INTEGER,
  request_count         INTEGER,
  status                TEXT NOT NULL DEFAULT 'ok',    -- ok | hard_failure
  declared_signals      TEXT NOT NULL DEFAULT '{}'     -- JSON opt-in por Passo
);
CREATE INDEX IF NOT EXISTS idx_measurement_combo
  ON measurement (instance_id, flow_id, step_id, captured_at);

-- Linha de Base: snapshot robusto (mediana + MAD) por combinação x métrica.
-- Cache para exibição; a detecção recomputa a partir da janela de measurement.
CREATE TABLE IF NOT EXISTS baseline (
  instance_id           INTEGER NOT NULL REFERENCES instance(id) ON DELETE CASCADE,
  flow_id               INTEGER NOT NULL REFERENCES flow(id) ON DELETE CASCADE,
  step_id               INTEGER NOT NULL REFERENCES step(id) ON DELETE CASCADE,
  metric                TEXT NOT NULL,                 -- duration_ms | ttfb_ms | bytes | request_count
  sample_count          INTEGER NOT NULL,
  median                REAL NOT NULL,
  mad                   REAL NOT NULL,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (instance_id, flow_id, step_id, metric)
);

-- Incidente: o caso investigável, a entrada do livro de registros.
CREATE TABLE IF NOT EXISTS incident (
  id                    INTEGER PRIMARY KEY,
  application_id        INTEGER NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  instance_id           INTEGER REFERENCES instance(id) ON DELETE SET NULL, -- null em Ambiental amplo
  flow_id               INTEGER REFERENCES flow(id) ON DELETE SET NULL,
  step_id               INTEGER REFERENCES step(id) ON DELETE SET NULL,
  metric                TEXT,
  kind                  TEXT NOT NULL DEFAULT 'application', -- application | environmental
  status                TEXT NOT NULL DEFAULT 'open',  -- open | investigating | diagnosed | resolved
  opened_at             TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at             TEXT,
  diagnosis             TEXT                           -- Diagnóstico (preenchido na investigação)
);

-- Anomalia: Medição que desvia da Linha de Base, ou falha dura. Vira Sintoma do Incidente.
CREATE TABLE IF NOT EXISTS anomaly (
  id                    INTEGER PRIMARY KEY,
  measurement_id        INTEGER NOT NULL REFERENCES measurement(id) ON DELETE CASCADE,
  incident_id           INTEGER REFERENCES incident(id) ON DELETE SET NULL,
  metric                TEXT NOT NULL,
  kind                  TEXT NOT NULL,                 -- statistical | hard_failure
  expected_median       REAL,
  expected_mad          REAL,
  observed              REAL,
  deviations            REAL,                          -- z-score modificado
  detected_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Plano de Ação: ações decididas para um Incidente.
CREATE TABLE IF NOT EXISTS action (
  id                    INTEGER PRIMARY KEY,
  incident_id           INTEGER NOT NULL REFERENCES incident(id) ON DELETE CASCADE,
  description           TEXT NOT NULL,
  owner                 TEXT,
  status                TEXT NOT NULL DEFAULT 'todo',  -- todo | doing | done
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Estado interno do detector para a regra de abertura/fechamento (2 Ciclos).
-- instance_id = 0 é o agregado ambiental por (flow, step). Sem FK de propósito.
CREATE TABLE IF NOT EXISTS step_state (
  instance_id           INTEGER NOT NULL,
  flow_id               INTEGER NOT NULL,
  step_id               INTEGER NOT NULL,
  consec_anom           INTEGER NOT NULL DEFAULT 0,
  consec_normal         INTEGER NOT NULL DEFAULT 0,
  open_incident_id      INTEGER,
  PRIMARY KEY (instance_id, flow_id, step_id)
);

-- Configurações simples (ex.: webhook do Google Chat para notificações).
CREATE TABLE IF NOT EXISTS setting (
  key                   TEXT PRIMARY KEY,
  value                 TEXT
);
