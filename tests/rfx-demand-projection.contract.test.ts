// Runs the actual handler with isolated tables. Does not certify PostgreSQL/RLS or production.
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import { memoryClient, type Row } from "./helpers/memory-client.ts";
import { rfxDemandOperation, rfxDemandService } from "../supabase/functions/rateware-api/rfx-demand-values.ts";
const serve = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = 'org:team-a';
function fixture() {
  const project = { id: uid(1), owner_email: OWNER, customer_id: uid(2), customer_name: 'Fixture shipper', title: 'Fixture RFx', opportunity_type: 'contract' };
  const data = memoryClient({
    rfx_projects: [project], shippers: [{ id: uid(2), owner_email: OWNER, company_name: 'Fixture shipper' }], shipper_opportunities: [],
    rfx_rfi_submissions: [{ id: uid(3), project_id: project.id, status: 'submitted' }],
    rfx_rfi_lanes: [ ['D2D Export', 'One Way'], ['D2D Import', 'One Way'], ['D2D Export', 'Round Trip'] ].map(([operation, service], i) => ({
      id: uid(10+i), project_id: project.id, operation_type: 'crossborder', service_type: 'standard', equipment_type: 'Truck Trailer', trailer_requirements: 'Dry Van',
      origin_text: 'Monterrey, NL', destination_text: 'Dallas, TX', origin_country: 'MX', destination_country: 'US', weekly_volume: 5, currency: 'USD',
      raw_payload: { operation, service },
    })),
    rfx_demand_snapshots: [], rfx_demand_lanes: [], rfx_packages: [], rfx_package_lanes: [], rfx_package_segments: [],
    rfx_events: [], rfx_lanes: [], rfx_ratebooks: [], rfx_ratebook_segments: [], rfx_process_audit: [], saas_audit_log: [],
    outreach_messages: [{ id: uid(50), rfx_event_id: uid(60), owner_email: OWNER, channel: 'email', status: 'drafted', html_body: '<p>Stored fixture</p>', vendors: { vendor_name: 'Fixture carrier' } },
      { id: uid(51), rfx_event_id: uid(60), owner_email: 'org:team-b', channel: 'email', html_body: 'Private foreign fixture' }],
  });
  async function call(body: Row, role = 'admin', owner = OWNER) {
    const handler = createRatewareApiHandler({ getClient: () => data.client as never,
      authenticate: () => Promise.resolve({ sub: 'fixture', email: 'fixture@example.test', roles: [role], rateware_organization_id: 'team-a' } as never),
      resolveUser: () => Promise.resolve({ owner_user_id: 'fixture', owner_email: owner, organization_id: 'team-a' } as never) });
    const response = await handler(new Request('https://rateware.test/functions/v1/rateware-api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  }
  return { ...data, call, project };
}
async function packageFixture() {
  const f = fixture();
  const snapshot = await f.call({ action: 'create_rfx_demand_snapshot', project_id: f.project.id });
  assertEquals(snapshot.status, 200, JSON.stringify(snapshot.body));
  const row = f.tables.rfx_demand_snapshots[0];
  row.rfx_demand_lanes = f.tables.rfx_demand_lanes; // Model the PostgREST relation, not a second source of truth.
  const pack = await f.call({ action: 'create_rfx_package', project_id: f.project.id, demand_snapshot_id: row.id });
  assertEquals(pack.status, 200, JSON.stringify(pack.body));
  const stored = f.tables.rfx_packages[0];
  stored.rfx_projects = f.project;
  stored.rfx_package_segments = f.tables.rfx_package_segments;
  stored.rfx_package_lanes = f.tables.rfx_package_lanes.map(link => ({ ...link, rfx_demand_lanes: f.tables.rfx_demand_lanes.find(lane => lane.id === link.demand_lane_id) }));
  return { f, stored };
}
Deno.test('payload seleccionado prevalece; respaldo antiguo tolera ausentes y valores inválidos', () => {
  for (const payload of [undefined, null, [], { operation: ' ', service: 0 }]) {
    assertEquals(rfxDemandOperation({ normalized_payload: payload, operation_type: 'crossborder' }), 'crossborder');
    assertEquals(rfxDemandService({ normalized_payload: payload, service_type: 'standard' }), 'standard');
  }
  assertEquals(rfxDemandOperation({ normalized_payload: { operation: ' D2D Import ' }, operation_type: 'crossborder' }), 'D2D Import');
  assertEquals(rfxDemandService({ normalized_payload: { service: 'Round Trip' }, service_type: 'standard' }), 'Round Trip');
  assertEquals(rfxDemandOperation({}), null);
});
Deno.test('Intake → snapshot → paquete → RFx conserva selecciones y separa tres segmentos; reintento no duplica evento', async () => {
  const { f, stored } = await packageFixture();
  assertEquals(f.tables.rfx_demand_lanes.map(l => l.operation_type), ['crossborder', 'crossborder', 'crossborder']);
  assertEquals(f.tables.rfx_package_segments.length, 3);
  assertEquals(new Set(f.tables.rfx_package_segments.map(s => s.segment_key)).size, 3);
  assertEquals(f.tables.rfx_package_segments.map(s => [s.operation, s.service]), [['D2D Export','One Way'],['D2D Import','One Way'],['D2D Export','Round Trip']]);
  const launched = await f.call({ action: 'launch_rfx_package_to_bid_room', package_id: stored.id });
  assertEquals(launched.status, 200, JSON.stringify(launched.body));
  assertEquals(f.tables.rfx_lanes.map(l => [l.operation,l.service]), [['D2D Export','One Way'],['D2D Import','One Way'],['D2D Export','Round Trip']]);
  assert(f.tables.rfx_lanes.every(l => f.tables.rfx_package_segments.some(s => s.segment_key === l.rfx_segment_key)));
  assertEquals((await f.call({ action: 'launch_rfx_package_to_bid_room', package_id: stored.id })).status, 200);
  assertEquals(f.tables.rfx_events.length, 1); assertEquals(f.tables.rfx_lanes.length, 3);
});
Deno.test('paquete legado conserva la clave y nombre del segmento y sus rubros', async () => {
  const { f, stored } = await packageFixture();
  const legacy = { ...f.tables.rfx_package_segments[0], segment_key: 'crossborder-standard-truck-trailer-dry-van', segment_name: 'Segmento legado', checklist: [{ rubric_key: 'business_rules', text: 'Regla conservada' }] };
  stored.rfx_package_segments = [legacy];
  const launched = await f.call({ action: 'launch_rfx_package_to_bid_room', package_id: stored.id });
  assertEquals(launched.status, 200, JSON.stringify(launched.body));
  assert(f.tables.rfx_lanes.every(l => l.rfx_segment_key === legacy.segment_key));
  assert(f.tables.rfx_lanes.every(l => l.rfx_segment_name === legacy.segment_name));
  assertEquals(f.tables.rfx_events[0].rfx_master_package.segments[0].checklist, legacy.checklist);
});
Deno.test('revisión admite lector; filtra evento y workspace, mantiene lectores antiguos y no escribe', async () => {
  const f = fixture();
  const read = (id: string, event?: string, owner = OWNER) => f.call({ action: 'get_outreach_message', id, ...(event ? { rfx_event_id: event } : {}) }, 'viewer', owner);
  const own = await read(uid(50), uid(60));
  assertEquals(own.status, 200); assertEquals(own.body.row.html_body, '<p>Stored fixture</p>');
  assertEquals((await read(uid(50), uid(61))).body.row, null);
  assertEquals((await read(uid(51), uid(60))).body.row, null);
  assertEquals((await read(uid(50), uid(60), 'org:team-b')).body.row, null);
  assertEquals((await read(uid(50))).body.row.id, uid(50));
  assertEquals(f.writes(), []);
});
