-- Preserve immutable historical approvals while allowing the reviewed Sales
-- superuser to record new signature approvals. Authority is still enforced by
-- osp_private.assert_approval_actor before this storage constraint is reached.

alter table osp_private.signature_approvals
  drop constraint signature_approvals_actor_email_check;

alter table osp_private.signature_approvals
  add constraint signature_approvals_actor_email_check check (
    actor_email in (
      'jgonzalez@xbfreight.com',
      'sales@heymarksman.com'
    )
  );
