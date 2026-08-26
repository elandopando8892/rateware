import { Link } from '@tanstack/react-router';

const validRoute = <Link to="/app/pipeline">Pipeline</Link>;
const validApprovalRoute = <Link to="/app/cases/$caseId/authorization" params={{ caseId: '33333333-3333-4333-8333-333333333333' }}>Authorization</Link>;
// @ts-expect-error The registered router must reject routes outside the OSP tree.
const invalidRoute = <Link to="/app/not-an-osp-route">Invalid</Link>;

void validRoute;
void validApprovalRoute;
void invalidRoute;
