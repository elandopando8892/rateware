import { callRatewareApi } from "./rateware-api.js";

export const loadGrowthDashboard = () => callRatewareApi("growth_dashboard");

export const importGrowthCsv = ({ rows, sourceFileName, sourceListName }) => callRatewareApi("import_growth_csv", {
  rows,
  source_file_name: sourceFileName,
  source_list_name: sourceListName
});

export const listGrowthSegments = () => callRatewareApi("list_growth_segments");
export const previewGrowthSegment = (criteria) => callRatewareApi("preview_growth_segment", { criteria });
export const saveGrowthSegment = (segment) => callRatewareApi("save_growth_segment", { segment });
export const archiveGrowthSegment = (id) => callRatewareApi("archive_growth_segment", { id });
export const restoreGrowthSegment = (id) => callRatewareApi("restore_growth_segment", { id });

export const listGrowthCampaigns = () => callRatewareApi("list_growth_campaigns");
export const getGrowthCampaign = (id) => callRatewareApi("get_growth_campaign", { id });
export const saveGrowthCampaign = (campaign) => callRatewareApi("save_growth_campaign", { campaign });
export const saveGrowthMessage = (message) => callRatewareApi("save_growth_message", { message });
export const exportGrowthCampaign = (id) => callRatewareApi("export_growth_campaign", { id });
export const setGrowthCampaignStatus = (id, status) => callRatewareApi("set_growth_campaign_status", { id, status });

export const listGrowthResults = (campaignId = "") => callRatewareApi("list_growth_results", {
  campaign_id: campaignId || undefined
});
export const recordGrowthResult = (result) => callRatewareApi("record_growth_result", { result });
export const convertGrowthResult = (resultId, conversion) => callRatewareApi("convert_growth_result", {
  result_id: resultId,
  conversion
});

export const runGrowthAiAction = (aiAction, payload = {}) => callRatewareApi("growth_ai_action", {
  ai_action: aiAction,
  ...payload
});
