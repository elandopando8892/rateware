# Build 28 — Private form assembly and signature consent

Build 28 assembles approved onboarding evidence into private form artifacts and introduces explicit, narrowly scoped signature authorization.

## Included

- versioned private form templates and field mappings;
- deterministic transformations for approved canonical facts;
- explicit signature consent scoped to package manifest, purpose, recipient, signer, method, and expiry;
- verified private signature-asset references, external e-sign, or manual-wet methods;
- single-use signature authorization consumption;
- bounded assembly worker leases and failure records;
- assembled PDF artifacts restricted to the private entity vault.

## Execution boundary

The worker revalidates the package status, expiry, manifest hash, template, disclosure level, and signature consent immediately before assembly. Fact values are read only for package items whose approved disclosure satisfies the mapping. Document and signature assets are passed to an injected private-vault assembler by reference.

## Signature file

The supplied JAGP signature image is not committed and is not automatically authorized. During the private pilot it must first become a verified `authorized_signature` or `signature_specimen` vault asset, followed by explicit consent for the exact package.

## Remaining boundary

Build 28 produces a private assembled artifact but cannot email it, create a public or signed URL, or submit it externally. Delivery begins only after the later communications build adds a separately bounded action.

## Validation

Clean migration replay, Provider Service tests, authorization no-regression, product regression, assembly invariants, and TypeScript parsing cover this build.
