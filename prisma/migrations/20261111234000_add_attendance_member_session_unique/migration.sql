-- Preserve historical check-ins while preventing concurrent duplicate active
-- attendance records. The index intentionally permits a new check-in after a
-- previous record reaches LEFT or LEFT_FORCED.
CREATE UNIQUE INDEX "attendance_active_member_session_key"
ON "attendance"("member_id", "session_id")
WHERE "status" IN ('PRESENT', 'PENDING_SIGNOUT');
