# Source-backed profile correction

Read the one-page XBFus Operating Authority PDF from the existing legal/compliance folder, extracted text, rendered the full page with Poppler, and inspected its image. Local SHA-256 e71643cecb0b43b0784ca2868230fc7a7c5c45e4e3f90b58909f2695fcea7f9e matches asset 52e2c9ef-cae2-47c4-9333-596742cf8e9f in the shared vault. It contains the legal name, MC identifier and broker-status snapshot that the open review lacks. This is documentary evidence, not a live regulatory-status verification or proof of carrier cargo/liability coverage.

The document API already accepts corrected reviewer values, but CorporateProfileWorkspace exposed only accept/reject. Added a bounded text correction using that same revision-checked API, decision note and explicit original-inspection confirmation. Changing the value resets confirmation. Restricted/withheld fields retain their withholding path. Placeholder acceptance is disabled.

This patch does not fill values automatically, claim review completion, promote facts, apply a signature or send anything. Live XBFUS review remains in_review revision 2 with its three pending fields. Preview/render verification and live source-backed correction are still required before claiming completion.

Initial regression run exposed missing per-test DOM cleanup; explicit cleanup fixed isolation. The new test covers placeholder rejection, confirmation requirements, confirmation reset after editing, exact corrected command/revision, and zero promotion calls.
