CREATE TABLE IF NOT EXISTS import_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL UNIQUE REFERENCES household_members(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS import_emails (
  id uuid PRIMARY KEY,
  mailbox_id uuid NOT NULL REFERENCES import_mailboxes(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'importing', 'imported', 'failed'))
);
CREATE INDEX IF NOT EXISTS import_emails_mailbox_received ON import_emails(mailbox_id, received_at DESC);
