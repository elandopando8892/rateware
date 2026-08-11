CREATE OR REPLACE FUNCTION public.rateware_sync_bi_vendor_dimensions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.rateware_bi_rate_facts facts
  SET
    dimensions = public.rateware_bi_fact_dimensions(rates, NEW),
    updated_at = now()
  FROM public.rate_staging rates
  WHERE facts.rate_id = rates.id
    AND facts.vendor_id = NEW.id
    AND facts.owner_email = lower(NEW.owner_email);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS rateware_bi_vendor_fact_sync ON public.vendors;
DROP TRIGGER IF EXISTS rateware_bi_vendor_dimension_sync ON public.vendors;

CREATE TRIGGER rateware_bi_vendor_fact_sync
AFTER UPDATE OF vendor_name, domain, owner_email
ON public.vendors
FOR EACH ROW
WHEN (
  OLD.vendor_name IS DISTINCT FROM NEW.vendor_name
  OR OLD.domain IS DISTINCT FROM NEW.domain
  OR OLD.owner_email IS DISTINCT FROM NEW.owner_email
)
EXECUTE FUNCTION public.rateware_sync_bi_vendor_facts();

CREATE TRIGGER rateware_bi_vendor_dimension_sync
AFTER UPDATE OF base_stage, status
ON public.vendors
FOR EACH ROW
WHEN (
  (
    OLD.base_stage IS DISTINCT FROM NEW.base_stage
    OR OLD.status IS DISTINCT FROM NEW.status
  )
  AND OLD.vendor_name IS NOT DISTINCT FROM NEW.vendor_name
  AND OLD.domain IS NOT DISTINCT FROM NEW.domain
  AND OLD.owner_email IS NOT DISTINCT FROM NEW.owner_email
)
EXECUTE FUNCTION public.rateware_sync_bi_vendor_dimensions();

REVOKE ALL ON FUNCTION public.rateware_sync_bi_vendor_dimensions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rateware_sync_bi_vendor_dimensions() FROM anon;
REVOKE ALL ON FUNCTION public.rateware_sync_bi_vendor_dimensions() FROM authenticated;
