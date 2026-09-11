CREATE TABLE IF NOT EXISTS monitors (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    url TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 60
        CHECK (interval_seconds BETWEEN 10 AND 3600),
    expected_status INTEGER NOT NULL DEFAULT 200,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checks (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    monitor_id INTEGER NOT NULL
        REFERENCES monitors(id) ON DELETE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ok BOOLEAN NOT NULL,
    status_code INTEGER,
    latency_ms INTEGER,
    error TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    monitor_id INTEGER NOT NULL
        REFERENCES monitors(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    cause TEXT
);

CREATE INDEX IF NOT EXISTS idx_checks_monitor_checked_at
    ON checks (monitor_id, checked_at);