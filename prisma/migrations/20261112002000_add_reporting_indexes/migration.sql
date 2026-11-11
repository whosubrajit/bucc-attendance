CREATE INDEX "attendance_check_in_at_status_idx"
ON "attendance"("check_in_at", "status");

CREATE INDEX "audit_logs_created_at_idx"
ON "audit_logs"("created_at");

CREATE INDEX "sessions_pre_event_active_starts_at_idx"
ON "sessions"("is_pre_event", "is_active", "starts_at");
