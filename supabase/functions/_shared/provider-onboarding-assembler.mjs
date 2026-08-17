// Concrete ProviderOnboardingFormAssembler.
//
// Implements the interface declared in provider-onboarding-form-assembly.ts.
// The worker there already enforces package approval, manifest binding, disclosure
// mode and signature consent. This module is responsible for the bytes only, and
// for two invariants the worker cannot check on its own:
//
//   1. the template must still hash to the value registered at approval time —
//      a changed template invalidates the authorization;
//   2. nothing may leave the private bucket. No public URL is ever created.

import { assembleFormDocument, describeArtifact, detectFormat } from './provider-onboarding-form-adapters.mjs';

const SIGNATURE_METHODS_REQUIRING_ASSET = new Set(['stored_signature_asset']);

async function downloadBytes(supabase, bucket, path) {
  const result = await supabase.storage.from(bucket).download(path);
  if (result.error || !result.data) throw result.error || new Error(`Private object was not readable: ${bucket}.`);
  const buffer = typeof result.data.arrayBuffer === 'function' ? await result.data.arrayBuffer() : result.data;
  return new Uint8Array(buffer);
}

/**
 * Builds an assembler bound to a Supabase client.
 *
 * @param options.signaturePlacements map of template path -> {page,x,y,width,height}
 *        Placements are reviewed configuration, never inferred at runtime: a
 *        signature is only ever drawn where an operator has approved it.
 * @param options.overlays map of template path -> approved flat-PDF coordinates.
 */
export function createProviderOnboardingAssembler(supabase, options = {}) {
  const signaturePlacements = options.signaturePlacements ?? {};
  const overlays = options.overlays ?? {};

  return {
    async assembleAndStore({ template, fields, documentReferences, signatureReference, output }) {
      const templateBytes = await downloadBytes(supabase, template.bucket, template.path);
      const observed = await describeArtifact(templateBytes);
      if (observed.sha256 !== template.sha256) {
        throw new Error('Form template changed after approval; assembly is refused.');
      }

      const format = detectFormat(template.path, null);
      if (!format) throw new Error('Form template format could not be determined.');

      let signature = null;
      if (signatureReference) {
        if (SIGNATURE_METHODS_REQUIRING_ASSET.has(signatureReference.method)) {
          if (format !== 'pdf') throw new Error('Stored signature assets can only be applied to PDF templates.');
          const placement = signaturePlacements[template.path];
          if (!placement) throw new Error('No approved signature placement exists for this template.');
          if (!signatureReference.assetId) throw new Error('Signature authorization has no signature asset.');
          const asset = await supabase.from('provider_legal_entity_document_assets')
            .select('storage_bucket,storage_path,file_sha256')
            .eq('id', signatureReference.assetId)
            .eq('lifecycle_status', 'active')
            .maybeSingle();
          if (asset.error) throw asset.error;
          if (!asset.data) throw new Error('Active signature asset was not found.');
          const pngBytes = await downloadBytes(supabase, asset.data.storage_bucket, asset.data.storage_path);
          const signatureHash = await describeArtifact(pngBytes);
          if (asset.data.file_sha256 && signatureHash.sha256 !== asset.data.file_sha256) {
            throw new Error('Signature asset bytes do not match the registered hash.');
          }
          signature = { pngBytes, ...placement };
        }
        // external_esign and manual_wet are completed outside this worker; the
        // assembled artifact intentionally carries no drawn signature.
      }

      const result = await assembleFormDocument({
        format,
        templateBytes,
        fields,
        overlay: overlays[template.path] ?? null,
        signature,
      });

      if (result.fidelity === 'requires_human_layout_review') {
        throw new Error('Flat form template has no approved overlay; human layout review is required.');
      }
      if (result.fidelity === 'original_preserved') {
        throw new Error(`Legacy ${result.format} template requires human conversion before assembly.`);
      }

      const described = await describeArtifact(result.bytes);
      const uploaded = await supabase.storage.from(output.bucket).upload(output.path, result.bytes, {
        contentType: 'application/octet-stream',
        upsert: false,
      });
      if (uploaded.error) throw uploaded.error;

      return {
        bucket: output.bucket,
        path: output.path,
        sha256: described.sha256,
        sizeBytes: described.sizeBytes,
        filledFields: result.filled_fields,
        reviewTasks: result.review_tasks,
        documentReferenceCount: Array.isArray(documentReferences) ? documentReferences.length : 0,
      };
    },
  };
}
