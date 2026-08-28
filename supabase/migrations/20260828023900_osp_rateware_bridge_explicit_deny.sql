create policy osp_rateware_document_bridges_deny_all
on osp_private.rateware_document_bridges
for all
to public
using (false)
with check (false);
