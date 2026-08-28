# OSP dual-entity corporate profile

## Product outcome

OSP maintains one governed XBF corporate profile for each legal entity and assembles the correct provider-registration package without asking operators to retype the same information. Mexico and United States remain distinct legal entities; a provider request selects one entity before any form mapping or evidence release occurs.

## Reused Rateware source of truth

No new database tables are required for the first persistence phase. OSP reuses the existing private Rateware vault:

- `provider_legal_entity_profile_fields` for versioned, verified facts.
- `provider_legal_entity_document_assets` for private evidence metadata and release policy.
- `provider_legal_entity_release_packages` and `provider_legal_entity_release_items` for a provider-specific, approval-gated package.
- The existing promotion and workspace projections for review state and readiness.

The OSP browser must never query these private tables directly. A read-only OSP API will return only masked projections and readiness summaries; mutations remain service-role commands with explicit operator authorization.

## Canonical profile taxonomy

| Group | Canonical field codes | Default handling |
| --- | --- | --- |
| Identity | `legal_name`, `tax_identifier`, `entity_identifier`, `entity_type`, `tax_regime` | Tax and entity identifiers masked in UI; approval required for release |
| Authority | `mc_number`, `usdot_number`, `broker_authority_status` | Entity-specific and evidence-backed |
| Presence | `registered_address`, `commercial_address`, `business_start_year`, `address_tenure_years` | Review before release |
| People | `legal_representative`, `general_manager`, `accounts_payable_contact`, `principal_names` | Personal data masked outside operator scope |
| Communications | `billing_email`, `website`, `business_phone` | Release only for the selected provider purpose |
| Credit | `requested_credit_amount`, `payment_terms`, `billing_instructions` | Consequential values require operator confirmation |
| Banking | `bank_name`, `bank_address`, `bank_officer_reference` | Restricted; never included implicitly |
| References | `trade_references`, `affiliated_company` | Structured JSON fact; review before release |
| Execution | `signer_name`, `signer_title`, `effective_date` | Signature is an evidence asset, never a reusable plain-text field |

Every value carries entity, tenant, version, provenance, review state and lifecycle status. The UI may display completeness without exposing the underlying restricted value.

## Evidence taxonomy

| Document type | Sensitivity | Release rule |
| --- | --- | --- |
| `tax_certificate` / `w9` | Restricted | Explicit package approval |
| `formation_document` | Restricted | Explicit package approval |
| `operating_authority` | Restricted | Explicit package approval |
| `surety_bond` | Restricted | Explicit package approval |
| `bank_reference` / `bank_statement` | Highly restricted | Named provider, purpose and approver required |
| `authorized_signature` | Highly restricted | Named provider, purpose and separate execution approval required |
| Credentials, tokens or private keys | Prohibited | Never store as evidence; never release |

File names are not trusted as classifications. Registration requires content checks, a SHA-256 fingerprint, version key, validity dates and a human-reviewed release policy.

## End-to-end flow

1. Intake identifies the requesting transport provider and the required XBF legal entity.
2. OSP displays masked profile completeness and missing evidence.
3. Mapping proposes answers from verified facts; an operator confirms consequential fields.
4. OSP assembles a provider-specific release package from immutable versions.
5. Restricted items require an approval reference; signature execution is a separate gate.
6. The system records a release fingerprint before any later outbound action.

## Current preview boundary

The `/app/profile` experience uses synthetic values only. It performs no database writes, file uploads, releases, emails, webhooks, signatures or provider submissions. Connecting real corporate values requires a separately authorized, private ingestion run and production deployment.
