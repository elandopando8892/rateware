# P3-V3 Platform 55 Wireframe Set

This frozen set is the visual source of truth for the P3-V3 Procurement and Network wave. It does not grant implementation or release credit.

## Source artifacts

| Artifact | SHA-256 | Role |
| --- | --- | --- |
| `platform55-build05-procurement-wireframe-1920x1080.png` | `86dba1e02c3b8d869c0fde2e58f4b0f0f1a01f11900f9545fecc60f12d27bd31` | Build 05 procurement hierarchy, evidence cards, acceptance boundary, and compact information density. |
| `platform55-service-network-wireframe-1920x1080.png` | `5b8d3139e77e1796acb9140c2257d86d7343063dd5c190cdc8005fe6f133b7ac` | Platform 55 Service Catalog low-fidelity hierarchy for the carrier directory and 360 workspace. |
| `platform55-service-360-reference-1920x1080.png` | `1fb16cf0bb7df0d53f98e46b957bcdf67c68014a5df6748efd93660d8ebb176b` | High-fidelity reference for tabs, context boundary, metadata grid, status treatment, and shell density. |

The Build 05 image was captured read-only from the hash-routed `wireframes` state of `rateware_procurement_carrier_network_build_v05.html`. The two Service images preserve the original supplied PNG bytes.

## Route mapping

| Rateware route | Platform 55 source | P3-V3 composition | Functional boundary |
| --- | --- | --- | --- |
| `vendors.html` | Service Catalog wireframe plus Service 360 reference | identity header, health metadata, directory workspace, governed secondary detail | Existing vendor creation, editing, imports, matching, and sourcing controls remain authoritative. |
| `rfx-process.html` | Build 05 Procurement wireframe | project identity, lifecycle readiness, evidence panels, acceptance boundary | Existing project creation and readiness logic remain authoritative. |
| `rfx-events.html` | Build 05 Procurement wireframe | event identity, lifecycle rail, bid workspace, next-action evidence | Existing event, lane, invitation, auction, and award controllers remain authoritative. |
| `ratebook.html` | Build 05 Procurement wireframe | agreement identity, validity metrics, consolidated route workspace, controlled distribution | Existing filters, exports, sharing, and immutable rate boundaries remain authoritative. |
| `outreach.html` | Build 05 Procurement wireframe | campaign identity, draft/confirmation metrics, communication workspace, prohibited-action boundary | Existing campaign, template, draft, and delivery controls remain authoritative. |

## Same-state comparison contract

- Compare at `1440x900`, `1024x768`, and `390x844`.
- Compare matching loaded and non-happy states; do not compare a loaded source with an empty implementation.
- Keep the page heading, primary action, state evidence, and governing boundary visible without evidence-time scrolling.
- Preserve one primary heading and one primary action per route.
- Wide tables and rails scroll inside their own surfaces on narrow viewports; the document must not overflow horizontally.
- No P3-V3 route is accepted until source, candidate, and difference matrix are content-addressed and independently reviewed.

## Intended visual result

P3-V3 adapts Rateware's real procurement content to Platform 55's hierarchy: a compact identity header, an explicit operational boundary, a restrained metric layer, and a dominant governed workspace. It does not copy demo fixtures, synthetic counts, or Build 05 mutation behavior.
