do $$
declare
  affected integer;
begin
  update osp_private.production_controls
  set rateware_xlsx_routing_enabled = true,
      rateware_xlsx_routing_active_after = statement_timestamp(),
      version = version + 1,
      updated_at = statement_timestamp()
  where id = 'singleton'
    and release_mode = 'shadow'
    and outbound_enabled = false
    and rateware_xlsx_routing_enabled = false
    and rateware_xlsx_routing_active_after is null
    and version < 2147483647;

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception using
      errcode = '55000',
      message = 'RATEWARE_XLSX_ROUTING_ACTIVATION_CONFLICT';
  end if;
end;
$$;
