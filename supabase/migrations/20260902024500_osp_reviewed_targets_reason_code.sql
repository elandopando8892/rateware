alter table osp_private.review_decisions
  drop constraint review_decisions_reason_code_check;

alter table osp_private.review_decisions
  add constraint review_decisions_reason_code_check check (reason_code in (
    'SOURCE_CONFIRMED',
    'VALUE_CORRECTED',
    'DOCUMENT_APPROVED',
    'MAPPING_CONFIRMED',
    'MAPPING_CORRECTED',
    'ARTIFACT_TARGETS_CONFIRMED',
    'REJECTED_INVALID',
    'REJECTED_UNSUPPORTED'
  ));

