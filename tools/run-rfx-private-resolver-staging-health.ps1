param(
  [Parameter(Mandatory = $true)]
  [string]$ParentProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$BranchName
)

$ErrorActionPreference = "Stop"

try {
  $branchJson = & npx --yes supabase branches get $BranchName --project-ref $ParentProjectRef --output json
  if ($LASTEXITCODE -ne 0) { throw "Could not retrieve staging branch credentials." }
  $branch = $branchJson | ConvertFrom-Json
  if (-not $branch.SUPABASE_URL -or -not $branch.SUPABASE_SERVICE_ROLE_KEY) {
    throw "Staging branch credentials are incomplete."
  }

  $env:MARKSMAN_STAGING_SUPABASE_URL = $branch.SUPABASE_URL
  $env:RATEWARE_SUPABASE_SERVICE_ROLE_KEY = $branch.SUPABASE_SERVICE_ROLE_KEY
  & node tools/check-rfx-private-resolver-staging-health.mjs
  if ($LASTEXITCODE -ne 0) { throw "Staging health check failed." }
}
finally {
  Remove-Item Env:MARKSMAN_STAGING_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:RATEWARE_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $branch = $null
}
