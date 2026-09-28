-- The RFI template's lists in the shared catalog, without renaming the FCM's.
-- The Freight Cost Model sheet (cusCatalog) keeps its names as the official
-- ones: the rate history, BI, the Bid Room benchmark and the FCM engine all
-- use them. A template name that means the same operation is added as a
-- synonym (raw = template name, normalized = the FCM's name); what the
-- template lists and the catalog lacked is added as its own value.
-- Source rateware_seed ranks below the sheet's rows, so a shared key keeps
-- resolving to the sheet's row; every raw value added here is unique.

insert into public.rateware_catalog_items (source, category, raw_value, normalized_value, metadata, active)
values
  ('rateware_seed', 'operation', 'Intra-MX', 'Intra-Mex', '{"origin":"rfi_template","kind":"synonym"}'::jsonb, true),
  ('rateware_seed', 'operation', 'US/CA Northbound', 'US Northbound', '{"origin":"rfi_template","kind":"synonym"}'::jsonb, true),
  ('rateware_seed', 'operation', 'US/CA Southbound', 'US Southbound', '{"origin":"rfi_template","kind":"synonym"}'::jsonb, true),
  ('rateware_seed', 'operation', 'MX Drayage', 'MX Drayage', '{"origin":"rfi_template","note":"Mexican port drayage; the FCM Drayage is the US leg"}'::jsonb, true),
  ('rateware_seed', 'operation', 'Local MX', 'Local MX', '{"origin":"rfi_template"}'::jsonb, true),
  ('rateware_seed', 'operation', 'Local US/CA', 'Local US/CA', '{"origin":"rfi_template"}'::jsonb, true),
  ('rateware_seed', 'operation', 'Intra-US/CA', 'Intra-US/CA', '{"origin":"rfi_template"}'::jsonb, true),
  ('rateware_seed', 'service', 'Expedited', 'Expedited', '{"origin":"rfi_template"}'::jsonb, true),
  ('rateware_seed', 'service', 'Milkrun', 'Milkrun', '{"origin":"rfi_template"}'::jsonb, true),
  ('rateware_seed', 'service', 'Dedicated', 'Dedicated', '{"origin":"rfi_template"}'::jsonb, true)
on conflict (source, category, raw_value, normalized_value) do nothing;

-- The template's crossings QuoteDesk didn't list, named Mexico first like the
-- rest. Ranks stay above Nuevo Laredo / Laredo (10), QuoteDesk's default.
insert into public.border_crossing_pairs (mx_city, mx_state, us_city, us_state, crossing_name, default_rank)
values
  ('Colombia', 'NL', 'Laredo', 'TX', 'Colombia / Laredo', 15),
  ('Cd. Juarez', 'CH', 'Santa Teresa', 'NM', 'Cd. Juarez / Santa Teresa', 45),
  ('Ojinaga', 'CH', 'Presidio', 'TX', 'Ojinaga / Presidio', 65),
  ('Agua Prieta', 'SO', 'Douglas', 'AZ', 'Agua Prieta / Douglas', 75),
  ('San Luis Rio Colorado', 'SO', 'San Luis', 'AZ', 'San Luis Rio Colorado / San Luis', 95)
on conflict (mx_city, mx_state, us_city, us_state, crossing_name) do nothing;
