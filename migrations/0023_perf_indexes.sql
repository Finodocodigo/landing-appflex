-- Índices de performance para as queries da central-dash.
--
-- Motivo (medido em 2026-08-14 via d1QueriesAdaptiveGroups, janela de 14 dias
-- neste banco): quatro queries de leitura da dashboard respondiam por ~112M
-- rows read — cerca de 1/3 de todo o consumo de leitura do act08 — porque
-- faziam SCAN de tabela onde existia índice parcial ou nenhum.
--
--   SELECT status, error_message, run_at FROM sync_log ORDER BY run_at DESC
--       28,5M rows / 6.157 execuções  → SCAN sync_log + TEMP B-TREE (ORDER BY)
--   SELECT MAX(run_at) FROM sync_log WHERE status = 'ok'
--       17,2M rows / 7.466 execuções  → SCAN (status não indexado)
--   SELECT COUNT(*) FROM sync_log WHERE status='error' AND run_at >= ?
--       14,4M rows / 6.178 execuções  → SCAN (status não indexado)
--   SELECT COUNT(...) FROM event_log WHERE event_name=? AND timestamp BETWEEN
--       52,6M rows / 12.211 execuções → usa idx_event_log_event_name e filtra
--                                        timestamp linha a linha
--
-- O índice existente idx_sync_log_platform_run_at(platform, run_at DESC) não
-- serve para nenhuma delas: as três filtram/ordenam SEM `platform`, e um índice
-- composto só é utilizável a partir do seu prefixo.
--
-- Custo: cada índice adiciona 1 row written por INSERT na tabela indexada.
-- sync_log recebe ~120 linhas/dia e event_log ~30 — irrelevante frente ao teto
-- de 50M rows written/mês do Workers Paid.

-- sync_log: ORDER BY run_at DESC LIMIT n (sem filtro de plataforma).
CREATE INDEX IF NOT EXISTS idx_sync_log_run_at
    ON sync_log(run_at DESC);

-- sync_log: MAX(run_at) WHERE status='ok' e COUNT(*) WHERE status='error'
-- AND run_at >= ?. Com (status, run_at) ambas viram busca no índice.
CREATE INDEX IF NOT EXISTS idx_sync_log_status_run_at
    ON sync_log(status, run_at DESC);

-- event_log: os contadores de funil da dash (PitchView, InitiateCheckout)
-- filtram sempre por event_name + janela de timestamp. O composto na ordem
-- (igualdade, range) é o que o SQLite consegue usar inteiro.
-- Torna idx_event_log_event_name redundante (é prefixo deste), mas o drop fica
-- para um passo separado — remover índice é irreversível dentro da migration.
CREATE INDEX IF NOT EXISTS idx_event_log_name_ts
    ON event_log(event_name, timestamp);

-- sessions: drill-down por campanha (COUNT(*) por janela + utm_campaign).
-- Era a query mais LENTA do banco (68ms, 66k rows por execução) porque só o
-- range de created_at estava indexado e utm_campaign era filtrado linearmente.
CREATE INDEX IF NOT EXISTS idx_sessions_utm_campaign_created
    ON sessions(utm_campaign, created_at);
