import { callRatewareApi } from "./rateware-api.js";

export async function fetchRfxProcessProjects(options = {}) {
  return await callRatewareApi("list_rfx_process_projects", options);
}

export async function createRfxProcessProject(project) {
  return (await callRatewareApi("create_rfx_process_project", { project })).row;
}

export async function fetchRfxProcessProject(projectId) {
  return await callRatewareApi("get_rfx_process_project", { project_id: projectId });
}

export async function updateRfxProcessProject(projectId, patch) {
  return (await callRatewareApi("update_rfx_process_project", { project_id: projectId, patch })).row;
}

export async function createRfxRfiMagicLink(projectId, options = {}) {
  return await callRatewareApi("create_rfx_rfi_magic_link", {
    project_id: projectId,
    app_origin: window.location.origin,
    ...options
  });
}

export async function revokeRfxRfiMagicLink(projectId, linkId) {
  return (await callRatewareApi("revoke_rfx_rfi_magic_link", { project_id: projectId, link_id: linkId })).row;
}

export async function reopenRfxRfi(projectId) {
  return (await callRatewareApi("reopen_rfx_rfi", { project_id: projectId })).row;
}

export async function createRfxDemandSnapshot(projectId, options = {}) {
  return await callRatewareApi("create_rfx_demand_snapshot", { project_id: projectId, ...options });
}

export async function createRfxPackage(projectId, snapshotId, options = {}) {
  return await callRatewareApi("create_rfx_package", {
    project_id: projectId,
    demand_snapshot_id: snapshotId,
    ...options
  });
}

export async function launchRfxPackageToBidRoom(packageId, options = {}) {
  return await callRatewareApi("launch_rfx_package_to_bid_room", { package_id: packageId, ...options });
}

export async function createRfxAwardPackage(projectId, payload = {}) {
  return await callRatewareApi("create_rfx_award_package", { project_id: projectId, ...payload });
}
