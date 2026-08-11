DROP TRIGGER IF EXISTS rateware_bi_vendor_fact_sync ON public.vendors;

CREATE TRIGGER rateware_bi_vendor_fact_sync
AFTER UPDATE OF vendor_name, domain, base_stage, status, owner_email
ON public.vendors
FOR EACH ROW
WHEN (
  OLD.vendor_name IS DISTINCT FROM NEW.vendor_name
  OR OLD.domain IS DISTINCT FROM NEW.domain
  OR OLD.base_stage IS DISTINCT FROM NEW.base_stage
  OR OLD.status IS DISTINCT FROM NEW.status
  OR OLD.owner_email IS DISTINCT FROM NEW.owner_email
)
EXECUTE FUNCTION public.rateware_sync_bi_vendor_facts();
