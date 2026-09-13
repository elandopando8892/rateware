-- Invitation bearer credentials do not belong in fit-response metadata.
-- This migration removes only that credential-shaped metadata key.

update public.rfx_segment_confirmations
set metadata = coalesce(metadata, '{}'::jsonb) - 'invitation_token',
    updated_at = now()
where coalesce(metadata, '{}'::jsonb) ? 'invitation_token';

comment on column public.rfx_segment_confirmations.metadata is
  'Non-credential operational provenance. Invitation tokens and other bearer credentials are prohibited.';
