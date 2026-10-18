-- Candidate only. Apply through a separately authorized production release.
BEGIN;
CREATE TABLE public.rfx_handoff_receipts (
 owner_email text NOT NULL, rfx_event_id uuid NOT NULL, operation_id uuid NOT NULL,
 request jsonb NOT NULL, before_fingerprint text NOT NULL, after_fingerprint text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_email,rfx_event_id,operation_id),
 UNIQUE(owner_email,rfx_event_id,before_fingerprint)
);
ALTER TABLE public.rfx_handoff_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfx_handoff_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.rfx_handoff_hash(p_event uuid) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT md5(jsonb_build_object(
 'event',(SELECT to_jsonb(e) FROM public.rfx_events e WHERE e.id=p_event),
 'lanes',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]') FROM public.rfx_lanes l WHERE l.rfx_event_id=p_event),
 'participants',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]') FROM public.rfx_lane_vendors v WHERE v.rfx_event_id=p_event),
 'confirmations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM public.rfx_segment_confirmations c WHERE c.rfx_event_id=p_event),
 'vendors',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]') FROM public.vendors v WHERE v.id IN (SELECT a.vendor_id FROM public.rfx_lane_vendors a WHERE a.rfx_event_id=p_event)),
 'staging',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') FROM public.rate_staging s WHERE s.id IN (SELECT a.rate_staging_id FROM public.rfx_lane_vendors a WHERE a.rfx_event_id=p_event UNION SELECT a.bid_rate_staging_id FROM public.rfx_lane_vendors a WHERE a.rfx_event_id=p_event))
 )::text);
$$;

CREATE FUNCTION public.rfx_handoff_snapshot(p_owner text,p_event uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF nullif(btrim(p_owner),'') IS NULL OR NOT EXISTS(SELECT 1 FROM public.rfx_events WHERE id=p_event AND owner_email=p_owner) THEN
  RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT';
 END IF;
 RETURN public.rfx_handoff_hash(p_event);
END $$;

CREATE FUNCTION public.rfx_handoff_lookup(p_owner text,p_event uuid,p_operation uuid,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rfx_handoff_receipts%rowtype;
BEGIN
 PERFORM public.rfx_handoff_snapshot(p_owner,p_event);
 SELECT * INTO r FROM public.rfx_handoff_receipts WHERE owner_email=p_owner AND rfx_event_id=p_event AND operation_id=p_operation;
 IF FOUND THEN
  IF r.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  RETURN r.result;
 END IF;
 RETURN NULL;
END $$;

-- Every child writer, including an insertion not in the preparation snapshot,
-- participates in the parent event fence. A detected deadlock aborts one complete
-- transaction; the HTTP adapter reports conflict, never silently retries.
CREATE FUNCTION public.rfx_handoff_event_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_event uuid;new_event uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN old_event:=OLD.rfx_event_id; END IF;
 IF TG_OP<>'DELETE' THEN new_event:=NEW.rfx_event_id; END IF;
 PERFORM 1 FROM public.rfx_events WHERE id IN (old_event,new_event) ORDER BY id FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rfx_handoff_event_fence BEFORE INSERT OR UPDATE OR DELETE ON public.rfx_lanes FOR EACH ROW EXECUTE FUNCTION public.rfx_handoff_event_fence();
CREATE TRIGGER rfx_handoff_event_fence BEFORE INSERT OR UPDATE OR DELETE ON public.rfx_lane_vendors FOR EACH ROW EXECUTE FUNCTION public.rfx_handoff_event_fence();
CREATE TRIGGER rfx_handoff_event_fence BEFORE INSERT OR UPDATE OR DELETE ON public.rfx_segment_confirmations FOR EACH ROW EXECUTE FUNCTION public.rfx_handoff_event_fence();

-- Private implementation helper, not a general API. Only fixed closeout tables;
-- callers cannot provide SQL, defaults are preserved, and unknown keys fail.
CREATE FUNCTION public.rfx_handoff_insert(p_table text,p_row jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cols text;known integer;supplied integer;
BEGIN
 IF p_table NOT IN ('raw_uploads','interpretation_jobs','rate_staging') OR jsonb_typeof(p_row)<>'object' THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 IF p_row ?| ARRAY['organization_id','owner_user_id','created_by','updated_by'] THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 SELECT count(*) INTO supplied FROM jsonb_object_keys(p_row);
 SELECT count(*),string_agg(format('%I',a.attname),',' ORDER BY a.attnum) INTO known,cols
 FROM pg_catalog.pg_attribute a WHERE a.attrelid=format('public.%I',p_table)::regclass AND a.attnum>0 AND NOT a.attisdropped AND p_row ? a.attname;
 IF known<>supplied OR known=0 THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)',p_table,cols,cols,p_table) USING p_row;
END $$;

CREATE FUNCTION public.rfx_handoff_commit(p_owner text,p_event uuid,p_operation uuid,p_request jsonb,p_expected text,p_plan jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE
 e public.rfx_events%rowtype; a public.rfx_lane_vendors%rowtype; s public.rate_staging%rowtype;
 r public.rfx_handoff_receipts%rowtype; item jsonb; link jsonb; fingerprint text;
 expected_outcome text; result jsonb; new_count integer; upload_id uuid;job_id uuid;
BEGIN
 IF nullif(btrim(p_owner),'') IS NULL OR p_operation IS NULL OR p_request IS NULL OR p_expected IS NULL OR p_plan IS NULL THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 SELECT * INTO e FROM public.rfx_events WHERE id=p_event AND owner_email=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 SELECT * INTO r FROM public.rfx_handoff_receipts WHERE owner_email=p_owner AND rfx_event_id=p_event AND operation_id=p_operation;
 IF FOUND THEN
  IF r.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  RETURN r.result;
 END IF;
 PERFORM 1 FROM public.vendors v WHERE v.id IN (SELECT vendor_id FROM public.rfx_lane_vendors WHERE rfx_event_id=p_event) ORDER BY v.id FOR UPDATE;
 PERFORM 1 FROM public.rate_staging s0 WHERE s0.id IN (SELECT rate_staging_id FROM public.rfx_lane_vendors WHERE rfx_event_id=p_event UNION SELECT bid_rate_staging_id FROM public.rfx_lane_vendors WHERE rfx_event_id=p_event) ORDER BY s0.id FOR UPDATE;
 fingerprint:=public.rfx_handoff_hash(p_event);
 SELECT * INTO r FROM public.rfx_handoff_receipts WHERE owner_email=p_owner AND rfx_event_id=p_event AND before_fingerprint=p_expected;
 IF FOUND THEN
  -- A different operation must not borrow another operation's acknowledgement:
  -- without its own durable association, its later replay would be ambiguous.
  RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT';
 END IF;
 IF fingerprint IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 IF jsonb_typeof(p_plan)<>'object' OR p_plan-ARRAY['upload','job','staging_inserts','staging_updates','links','result']<>'{}'::jsonb
 OR jsonb_typeof(p_plan->'staging_inserts') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'staging_updates') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_plan->'links') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'result') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 -- Temporal eligibility is evaluated after lock acquisition, not at preparation time.
 IF EXISTS(SELECT 1 FROM public.rfx_lane_vendors v LEFT JOIN public.vendors carrier ON carrier.id=v.vendor_id
  WHERE v.rfx_event_id=p_event AND v.invitation_status<>'archived' AND v.award_role IN ('primary','backup')
  AND ((v.valid_through IS NOT NULL AND v.valid_through<(clock_timestamp() AT TIME ZONE 'America/Mexico_City')::date) OR lower(carrier.status)='blocked')) THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM public.rfx_lanes l WHERE l.rfx_event_id=p_event AND l.no_award_at IS NULL AND NOT EXISTS(
  SELECT 1 FROM public.rfx_lane_vendors v WHERE v.rfx_lane_id=l.id AND v.rfx_event_id=p_event AND v.award_role='primary' AND v.invitation_status<>'archived' AND v.bid_rate IS NOT NULL)) THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM public.rfx_lane_vendors v JOIN public.vendors carrier ON carrier.id=v.vendor_id WHERE v.rfx_event_id=p_event AND (carrier.owner_email IS DISTINCT FROM p_owner)) THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;

 new_count:=jsonb_array_length(p_plan->'staging_inserts');
 IF new_count>0 THEN
  IF jsonb_typeof(p_plan->'upload') IS DISTINCT FROM 'object' OR jsonb_typeof(p_plan->'job') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  upload_id:=(p_plan->'upload'->>'id')::uuid;job_id:=(p_plan->'job'->>'id')::uuid;
  IF upload_id IS NULL OR job_id IS NULL OR p_plan->'upload'->>'owner_email' IS DISTINCT FROM p_owner
   OR p_plan->'upload'->>'status' IS DISTINCT FROM 'staged' OR p_plan->'job'->>'status' IS DISTINCT FROM 'completed'
   OR (p_plan->'job'->>'raw_upload_id')::uuid IS DISTINCT FROM upload_id THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 ELSE
  IF coalesce(p_plan->'upload','null'::jsonb)<>'null' OR coalesce(p_plan->'job','null'::jsonb)<>'null' THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 END IF;
 -- Validate every row before mutation. A server bug cannot cross event boundaries.
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'staging_updates') LOOP
  IF jsonb_typeof(item)<>'object' OR item-ARRAY['id','status','source_bid_status','rfx_bid_outcome','updated_at']<>'{}' THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  SELECT * INTO s FROM public.rate_staging WHERE id=(item->>'id')::uuid AND owner_email=p_owner;
  IF NOT FOUND OR s.status NOT IN ('pending_review','approved') THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  SELECT * INTO a FROM public.rfx_lane_vendors WHERE rfx_event_id=p_event AND invitation_status<>'archived' AND bid_rate IS NOT NULL AND (rate_staging_id=s.id OR bid_rate_staging_id=s.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  expected_outcome:=CASE a.award_role WHEN 'primary' THEN 'awarded' WHEN 'backup' THEN 'backup' ELSE 'not_awarded' END;
  IF item ? 'rfx_bid_outcome' AND item->>'rfx_bid_outcome' IS DISTINCT FROM expected_outcome THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  IF item ? 'source_bid_status' AND (item->>'source_bid_status'<>'awarded' OR a.award_role IS DISTINCT FROM 'primary') THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  IF item ? 'status' AND item->>'status' IS DISTINCT FROM s.status THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'staging_inserts') LOOP
  SELECT * INTO a FROM public.rfx_lane_vendors WHERE id=(item->'source_evidence'->>'rfx_lane_vendor_id')::uuid AND rfx_event_id=p_event;
  IF NOT FOUND OR a.invitation_status='archived' OR a.award_role IS DISTINCT FROM 'primary' OR a.bid_rate IS NULL OR a.rate_staging_id IS NOT NULL OR a.bid_rate_staging_id IS NOT NULL
   OR (item->>'id')::uuid IS NULL OR item->>'owner_email' IS DISTINCT FROM p_owner OR item->>'status' IS DISTINCT FROM 'pending_review'
   OR (item->>'vendor_id')::uuid IS DISTINCT FROM a.vendor_id OR (item->>'raw_upload_id')::uuid IS DISTINCT FROM upload_id OR (item->>'interpretation_job_id')::uuid IS DISTINCT FROM job_id
   OR (item->'source_evidence'->>'rfx_event_id')::uuid IS DISTINCT FROM p_event OR (item->'source_evidence'->>'rfx_lane_id')::uuid IS DISTINCT FROM a.rfx_lane_id
   OR (item->'source_evidence'->>'responded_at')::timestamptz IS DISTINCT FROM a.responded_at
   OR (item->>'carrier_cost_rate')::numeric IS DISTINCT FROM a.bid_rate OR (item->>'all_in_rate')::numeric IS DISTINCT FROM a.bid_rate
   OR item->>'currency' IS DISTINCT FROM a.currency THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_plan->'staging_inserts') x WHERE x->'source_evidence'->>'rfx_lane_vendor_id'=a.id::text)<>1 THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
 END LOOP;
 FOR link IN SELECT value FROM jsonb_array_elements(p_plan->'links') LOOP
  IF jsonb_typeof(link)<>'object' OR link-ARRAY['id','rate_staging_id','bid_rate_staging_id','rateware_closeout_at','updated_at']<>'{}' THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  SELECT * INTO a FROM public.rfx_lane_vendors WHERE id=(link->>'id')::uuid AND rfx_event_id=p_event;
  IF NOT FOUND OR a.award_role IS DISTINCT FROM 'primary' OR a.bid_rate IS NULL OR a.invitation_status='archived' OR a.rate_staging_id IS NOT NULL OR (link->>'rate_staging_id')::uuid IS NULL THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  IF a.bid_rate_staging_id IS NOT NULL THEN
   IF (link->>'rate_staging_id')::uuid IS DISTINCT FROM a.bid_rate_staging_id OR (link ? 'bid_rate_staging_id' AND (link->>'bid_rate_staging_id')::uuid IS DISTINCT FROM a.bid_rate_staging_id) THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
   SELECT * INTO s FROM public.rate_staging WHERE id=a.bid_rate_staging_id AND owner_email=p_owner;
   IF NOT FOUND OR s.vendor_id IS DISTINCT FROM a.vendor_id OR s.source_evidence->>'rfx_lane_vendor_id' IS DISTINCT FROM a.id::text OR s.status NOT IN ('pending_review','approved') THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  ELSE
   IF (link->>'bid_rate_staging_id')::uuid IS DISTINCT FROM (link->>'rate_staging_id')::uuid OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan->'staging_inserts') x WHERE x->>'id'=link->>'rate_staging_id' AND x->'source_evidence'->>'rfx_lane_vendor_id'=a.id::text) THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.rfx_lane_vendors a0 WHERE a0.rfx_event_id=p_event AND a0.invitation_status<>'archived' AND a0.award_role='primary' AND a0.bid_rate IS NOT NULL AND a0.rate_staging_id IS NULL
  AND (SELECT count(*) FROM jsonb_array_elements(p_plan->'links') x WHERE x->>'id'=a0.id::text)<>1) THEN RAISE EXCEPTION 'RFX_HANDOFF_CONFLICT'; END IF;

 IF new_count>0 THEN
  PERFORM public.rfx_handoff_insert('raw_uploads',p_plan->'upload');
  PERFORM public.rfx_handoff_insert('interpretation_jobs',p_plan->'job');
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'staging_updates') LOOP
  UPDATE public.rate_staging SET
   rfx_bid_outcome=CASE WHEN item ? 'rfx_bid_outcome' THEN item->>'rfx_bid_outcome' ELSE rfx_bid_outcome END,
   source_bid_status=CASE WHEN item ? 'source_bid_status' THEN item->>'source_bid_status' ELSE source_bid_status END,
   updated_at=clock_timestamp()
  WHERE id=(item->>'id')::uuid AND owner_email=p_owner;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'staging_inserts') LOOP
  PERFORM public.rfx_handoff_insert('rate_staging',item);
 END LOOP;
 FOR link IN SELECT value FROM jsonb_array_elements(p_plan->'links') LOOP
  UPDATE public.rfx_lane_vendors SET rate_staging_id=(link->>'rate_staging_id')::uuid,
   bid_rate_staging_id=coalesce(bid_rate_staging_id,(link->>'bid_rate_staging_id')::uuid),
   rateware_closeout_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=(link->>'id')::uuid AND rfx_event_id=p_event;
 END LOOP;
 UPDATE public.rfx_events SET status='awarded',updated_at=clock_timestamp() WHERE id=p_event AND owner_email=p_owner;
 result:=(p_plan->'result')||jsonb_build_object('receipt_operation_id',p_operation);
 INSERT INTO public.rfx_handoff_receipts(owner_email,rfx_event_id,operation_id,request,before_fingerprint,after_fingerprint,result)
 VALUES(p_owner,p_event,p_operation,p_request,p_expected,public.rfx_handoff_hash(p_event),result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.rfx_handoff_hash(uuid),public.rfx_handoff_insert(text,jsonb),public.rfx_handoff_event_fence(),public.rfx_handoff_snapshot(text,uuid),public.rfx_handoff_lookup(text,uuid,uuid,jsonb),public.rfx_handoff_commit(text,uuid,uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rfx_handoff_snapshot(text,uuid),public.rfx_handoff_lookup(text,uuid,uuid,jsonb),public.rfx_handoff_commit(text,uuid,uuid,jsonb,text,jsonb) TO service_role;
COMMIT;
