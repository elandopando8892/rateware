# P3-V1 design review — Command Center and Rateware

Date: 2026-08-23

Product SHA: `e962b54ee1ed049b0c020fd8278f48711105477e`

Product tree: `db331c5d482e629df24feb5e02697066ecf2282f`

Evidence matrix: `18/18` captures (`app.html` 4 states x 3 viewports; `rateware.html` 2 states x 3 viewports).

Boundary: local deterministic fixtures, GET/HEAD only, no external requests, no production writes, and no release credit. This author review supplies the scoring input only; P3-V1 remains pending an immutable independent review.

## Command Center (`app.html`)

Closest same-viewport reference: `docs/platform55-visual-parity/baseline/reference-command-center-1440x900.png`

Reference SHA-256: `c33772b6a7be35408606044ac222c1ca9bae2bfea662eb21f72e8af3298b40c3`

Representative screenshot: `app-data-1440x900.png`

Representative screenshot SHA-256: `920220acef330d0058dc491fc0a6b19fa64f260539e6a456cb53efa5a804d32c`

| Dimension | Awarded | Available | Review |
|---|---:|---:|---|
| Shell frame | 18 | 20 | The production shell preserves the reference's navigation rail, tenant switcher, search, status, notifications, and Ask AI hierarchy. The narrower reference account cluster is intentionally omitted because current authentication owns that surface. |
| Interior hierarchy | 23 | 25 | Page header, primary action, next-best-action hero, metrics, priority queue, lifecycle, My Work, and network pulse follow the reference composition. Current business data uses fewer queue rows and different lifecycle labels. |
| Visual system | 18 | 20 | Typography, neutral surfaces, indigo accents, dark action hero, spacing, borders, radii, and compact labels are recognizably Platform 55. Minor text-density variation remains from Rateware's live content. |
| Components and states | 18 | 20 | Data, loading, empty, and error states keep the same component frame and preserve their actionable boundaries. Some fixture values are intentionally synthetic and do not reproduce reference counts. |
| Responsive accessibility | 14 | 15 | Three viewports pass names, contrast, focus cycle/restore, reduced motion, overflow, network, and error-channel gates. Mobile deliberately stacks metrics and cards rather than scaling the desktop reference. |
| **Total** | **91** | **100** | Pure evaluator result: `accepted`; errors: `[]`. |

```json
{"route":"app.html","dimensions":{"shell_frame":18,"interior_hierarchy":23,"visual_system":18,"components_states":18,"responsive_accessibility":14},"states":["data","loading","empty","error"],"required_states":["data","loading","empty","error"],"viewports":[[1440,900],[1024,768],[390,844]],"reviewer_verdict":"GO","reference_sha256":"c33772b6a7be35408606044ac222c1ca9bae2bfea662eb21f72e8af3298b40c3","screenshot_sha256":"920220acef330d0058dc491fc0a6b19fa64f260539e6a456cb53efa5a804d32c","candidate_sha":"e962b54ee1ed049b0c020fd8278f48711105477e"}
```

## Rateware (`rateware.html`)

Closest pinned reference: `docs/platform55-visual-parity/baseline/reference-runtime-jobs-1920.png`

Reference SHA-256: `51bd248d9a9250090fb3769a188bff7d3a4be6c424478681f3c54cd119719cbc`

Representative screenshot: `rateware-loaded-1440x900.png`

Representative screenshot SHA-256: `80fd80b1473f9b0f8b205aee5328e1648aeb91b63a22bfe51cb21c5375ef095e`

| Dimension | Awarded | Available | Review |
|---|---:|---:|---|
| Shell frame | 18 | 20 | Rateware uses the same tenant shell, global search, system actions, page eyebrow, title, and primary-action placement. The 1920 reference exposes a longer platform navigation inventory than the current product route registry. |
| Interior hierarchy | 22 | 25 | The governed-operation boundary, five metrics, view tabs, filter toolbar, bulk scope, pagination, issue helper, and evidence table translate the reference's overview-to-detail rhythm to approved-rate work. The source domain is a rate grid rather than a runtime pipeline. |
| Visual system | 18 | 20 | The page uses the frozen tokens, card hierarchy, dense controls, subtle status surfaces, and compact table treatment of Platform 55. The wide operational schema necessarily retains more horizontal density than the reference jobs table. |
| Components and states | 18 | 20 | Loaded and deterministic error states preserve filters, review boundaries, pagination, issue navigation, table headers, retry, and controlled export actions. Secondary lifecycle controls remain disclosed instead of being removed. |
| Responsive accessibility | 14 | 15 | Three viewports pass names, contrast, focus cycle/restore, reduced motion, and contained table overflow. Mobile pagination and issue controls stack without collision; wide rate columns remain inside the owned table scroller. |
| **Total** | **90** | **100** | Pure evaluator result: `accepted`; errors: `[]`. |

```json
{"route":"rateware.html","dimensions":{"shell_frame":18,"interior_hierarchy":22,"visual_system":18,"components_states":18,"responsive_accessibility":14},"states":["loaded","error"],"required_states":["loaded","error"],"viewports":[[1440,900],[1024,768],[390,844]],"reviewer_verdict":"GO","reference_sha256":"51bd248d9a9250090fb3769a188bff7d3a4be6c424478681f3c54cd119719cbc","screenshot_sha256":"80fd80b1473f9b0f8b205aee5328e1648aeb91b63a22bfe51cb21c5375ef095e","candidate_sha":"e962b54ee1ed049b0c020fd8278f48711105477e"}
```

## Candidate verdict

Author scoring verdict: `GO` for independent review.

Both routes meet the exact acceptance floor (`total >= 90`; every weighted dimension at least 80%). This is not independent accreditation and does not update the route matrix or formal release ledger.
