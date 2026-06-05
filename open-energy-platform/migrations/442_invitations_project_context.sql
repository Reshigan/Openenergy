-- 442_invitations_project_context.sql
-- B2B invitation model: add project context + deal terms to invitations.
-- Enables IPP developers to invite lenders/offtakers/carbon funds pre-linked
-- to a specific project; approveRegistration then seeds role-appropriate chain
-- records (covenants for lenders, PPA shell for offtakers).

ALTER TABLE rbac_invitations ADD COLUMN project_id TEXT;
ALTER TABLE rbac_invitations ADD COLUMN deal_terms TEXT;  -- JSON blob for prefilled deal parameters
