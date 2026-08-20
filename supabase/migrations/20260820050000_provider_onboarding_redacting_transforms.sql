-- Make "redacted" mean something in the assembled document.
--
-- THE DEFECT
--
-- A release package item can be approved at disclosure_mode 'redacted'. The form
-- assembler gated on that -- a mapping declaring disclosure_required='redacted' accepts
-- an item released as 'redacted' or 'full' -- and then wrote the fact's FULL value into
-- the document, because every available transform (direct, uppercase, lowercase,
-- date_iso, boolean_yes_no) preserves the value.
--
-- So 'redacted' was an access gate that never redacted anything. An approver reading
-- "redacted" on a package would reasonably believe the value is masked in the output; it
-- was not. That gap between what the approver authorised and what the document carried
-- is how a disclosure incident happens.
--
-- THE FIX
--
-- Two transforms that actually mask, so a redacted release can produce a redacted
-- document. The assembler additionally refuses to write a non-masking transform from an
-- item released as 'redacted' -- the pairing is enforced there, where both halves are
-- known.
--
-- This does not decide whether any particular fact should be masked. It makes the
-- choice expressible and forces it to be made.

alter table public.provider_onboarding_form_field_mappings
  drop constraint if exists provider_onboarding_form_mappings_transform_check;
alter table public.provider_onboarding_form_field_mappings
  add constraint provider_onboarding_form_mappings_transform_check check (
    transform_code in ('direct','uppercase','lowercase','date_iso','boolean_yes_no',
                       'mask_all','mask_all_but_last4')
  );

comment on constraint provider_onboarding_form_mappings_transform_check
  on public.provider_onboarding_form_field_mappings is
'mask_all and mask_all_but_last4 are the only transforms that may consume a package item released at disclosure_mode=redacted; the assembler enforces that pairing.';
