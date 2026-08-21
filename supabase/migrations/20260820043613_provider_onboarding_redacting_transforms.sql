alter table public.provider_onboarding_form_field_mappings
  drop constraint if exists provider_onboarding_form_mappings_transform_check;
alter table public.provider_onboarding_form_field_mappings
  add constraint provider_onboarding_form_mappings_transform_check check (
    transform_code in ('direct','uppercase','lowercase','date_iso','boolean_yes_no',
                       'mask_all','mask_all_but_last4')
  );

comment on constraint provider_onboarding_form_mappings_transform_check
  on public.provider_onboarding_form_field_mappings is
'mask_all and mask_all_but_last4 are the only transforms that may consume a package item released at disclosure_mode=redacted; the assembler enforces that pairing.';;
