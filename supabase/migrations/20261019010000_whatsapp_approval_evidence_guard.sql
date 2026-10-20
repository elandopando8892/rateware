-- Sprint22-05 candidate. Local synthetic rehearsal only; no production approval.
BEGIN;
CREATE FUNCTION public.rateware_whatsapp_approval_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  IF OLD.channel = 'whatsapp'
    AND OLD.send_result ->> 'approval_contract' = 'outreach-version-v1'
    AND OLD.send_result -> 'whatsapp_snapshot' ->> 'contract' = 'bidware.whatsapp-approval.v1'
    AND OLD.send_attempt_id IS NOT NULL
  THEN
    IF OLD.status = 'sending' THEN
      IF NEW.send_result -> 'whatsapp_snapshot' IS DISTINCT FROM OLD.send_result -> 'whatsapp_snapshot'
        OR NEW.send_result -> 'whatsapp_approval' IS DISTINCT FROM OLD.send_result -> 'whatsapp_approval'
        OR jsonb_build_array(NEW.whatsapp_connection_id, NEW.normalized_recipient_phone,
          NEW.template_id, NEW.whatsapp_template_name, NEW.whatsapp_template_language,
          NEW.whatsapp_text, NEW.whatsapp_body, NEW.meta_whatsapp_group_id)
          IS DISTINCT FROM jsonb_build_array(OLD.whatsapp_connection_id, OLD.normalized_recipient_phone,
          OLD.template_id, OLD.whatsapp_template_name, OLD.whatsapp_template_language,
          OLD.whatsapp_text, OLD.whatsapp_body, OLD.meta_whatsapp_group_id)
      THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTREACH_WHATSAPP_APPROVAL_LOCKED';
      END IF;
    ELSIF NEW.send_attempt_id IS NOT DISTINCT FROM OLD.send_attempt_id THEN
      -- Keep the exact approved content across archive/manual status writes.
      -- A new attempt supplies a new snapshot; callbacks may add their evidence.
      NEW.send_result := coalesce(NEW.send_result, '{}'::jsonb) || jsonb_build_object(
        'whatsapp_snapshot', OLD.send_result -> 'whatsapp_snapshot',
        'whatsapp_approval', OLD.send_result -> 'whatsapp_approval'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.rateware_whatsapp_approval_evidence_guard() FROM PUBLIC;
CREATE TRIGGER zzz_rateware_whatsapp_approval_evidence_guard
BEFORE UPDATE ON public.outreach_messages FOR EACH ROW
EXECUTE FUNCTION public.rateware_whatsapp_approval_evidence_guard();
COMMIT;
