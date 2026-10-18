-- Prepared for Sprint 19. Do not apply without the human approval recorded in the thread.
BEGIN;

CREATE FUNCTION public.rateware_outreach_approval_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  previous_content jsonb;
  next_content jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'sending' AND OLD.send_result ->> 'approval_contract' = 'outreach-version-v1' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTREACH_ATTEMPT_LOCKED';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'sending'
    AND OLD.send_result ->> 'approval_contract' = 'outreach-version-v1'
  THEN
    previous_content := jsonb_build_array(
      OLD.owner_email, to_jsonb(OLD)->'campaign_id', to_jsonb(OLD)->'rfx_event_id',
      to_jsonb(OLD)->'rfx_lane_id', to_jsonb(OLD)->'rfx_lane_vendor_id',
      to_jsonb(OLD)->'vendor_id', OLD.channel, OLD.recipient_email,
      to_jsonb(OLD)->'recipient_phone', OLD.sender_email, OLD.subject,
      OLD.html_body, OLD.text_body, OLD.metadata
    );
    next_content := jsonb_build_array(
      NEW.owner_email, to_jsonb(NEW)->'campaign_id', to_jsonb(NEW)->'rfx_event_id',
      to_jsonb(NEW)->'rfx_lane_id', to_jsonb(NEW)->'rfx_lane_vendor_id',
      to_jsonb(NEW)->'vendor_id', NEW.channel, NEW.recipient_email,
      to_jsonb(NEW)->'recipient_phone', NEW.sender_email, NEW.subject,
      NEW.html_body, NEW.text_body, NEW.metadata
    );
    IF next_content IS DISTINCT FROM previous_content THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'OUTREACH_CONTENT_LOCKED: reconcile the active send before editing its content';
    END IF;
    IF (
      NEW.send_result ->> 'approval_contract' IS DISTINCT FROM OLD.send_result ->> 'approval_contract'
      OR NEW.send_result ->> 'approved_updated_at' IS DISTINCT FROM OLD.send_result ->> 'approved_updated_at'
      OR NEW.send_attempt_id IS DISTINCT FROM OLD.send_attempt_id
      OR NEW.send_started_at IS DISTINCT FROM OLD.send_started_at
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTREACH_APPROVAL_LOCKED';
    END IF;
    IF NEW.status IS NULL OR NEW.status NOT IN ('sending', 'sent', 'failed', 'delivery_unknown')
      OR (NEW.status <> 'sending' AND NEW.send_completed_at IS NULL)
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'OUTREACH_ATTEMPT_LOCKED';
    END IF;
  END IF;

  -- Manual delivery/status updates must retain this attempt's approval evidence.
  -- A new conditional send claim has a new attempt ID and supplies a new binding.
  IF OLD.status <> 'sending'
    AND OLD.send_result ->> 'approval_contract' = 'outreach-version-v1'
    AND NEW.send_attempt_id IS NOT DISTINCT FROM OLD.send_attempt_id
  THEN
    NEW.send_result := NEW.send_result || jsonb_build_object(
      'approval_contract', OLD.send_result ->> 'approval_contract',
      'approved_updated_at', OLD.send_result ->> 'approved_updated_at'
    );
  END IF;

  -- Preserve full PostgreSQL precision and advance even when a writer supplies
  -- the old timestamp, runs twice in one transaction, or the clock moves back.
  NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.rateware_outreach_approval_guard() FROM PUBLIC;
-- Run after the existing state-protection trigger, without replacing it.
CREATE TRIGGER zz_rateware_outreach_approval_guard
BEFORE UPDATE OR DELETE ON public.outreach_messages
FOR EACH ROW EXECUTE FUNCTION public.rateware_outreach_approval_guard();

COMMIT;
