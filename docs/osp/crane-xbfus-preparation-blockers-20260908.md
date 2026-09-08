# Crane authenticated preparation preflight

Live UI read as Sales: Crane case f2fa004f-d674-446c-80ca-e929cce75b51 remains RECEIVED v1, with email/PDF/DOCX source coverage and seven decision items. Its manifest targets XBFUS. Case selector offers only XBFMX because the read query requires at least one current canonical fact.

Live database: XBFUS a47f74f8-2664-47a9-ab67-2eb037de23cd is active with zero canonical current facts; XBFMX has seven. XBFUS already has 17 documentary assets, including verified articles of organization, EIN assignment and motor-carrier authority. Do not request duplicate uploads or bind to XBFMX to bypass this prerequisite.

In the authenticated corporate profile, opened Legal name evidence and started the existing Mc Authority review. UI reported audit persistence; database confirms review cb9fd68d-ea0d-44eb-889d-f8807335142c is in_review revision 2, asset 52e2c9ef-cae2-47c4-9333-596742cf8e9f. No accept/reject/promotion was performed.

Critical finding: all three review fields (legal_name, mc_number, broker_authority_status) have SQL NULL proposed_value. The read model renders this as “On file”, which is not an extracted or verified value. This cannot support approval. Next step is source-backed extraction/correction using existing assets and complete-document review; never accept the placeholder.

Crane questions include incorporation date/state, submission channel, signer/placement and conditional VAT/insurance fields. The template revision date versus incorporation date comparison is not by itself proof of a contradiction; inspect the original and resolve the actual company date without inventing facts. No request decisions saved, no package generated, no historical Salzillo mutation, signatures, emails, cron or queue actions.
