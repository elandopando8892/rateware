param(
  [Parameter(Mandatory = $true)]
  [string]$ParentProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$BranchName,

  [Parameter(Mandatory = $true)]
  [string]$BranchProjectRef
)

$ErrorActionPreference = "Stop"
$startedAt = (Get-Date).ToUniversalTime()
$stage = "initial-disable"

function Assert-Exit([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw $Message }
}

try {
  & "$PSScriptRoot/disable-rfx-private-resolver-staging.ps1" -BranchProjectRef $BranchProjectRef | Out-Host
  Assert-Exit "Could not prove the initial disabled state."

  $stage = "target-isolation"
  $branchRaw = & npx --yes supabase branches list --project-ref $ParentProjectRef --output json
  Assert-Exit "Could not inspect the staging branch."
  $branch = @($branchRaw | ConvertFrom-Json) | Where-Object { $_.name -eq $BranchName }
  if (-not $branch -or $branch.project_ref -ne $BranchProjectRef -or $branch.persistent -ne $true -or $branch.with_data -ne $false -or $branch.status -ne "FUNCTIONS_DEPLOYED") {
    throw "Staging branch isolation or deployment status drifted."
  }

  $functionsRaw = & npx --yes supabase functions list --project-ref $BranchProjectRef --output json
  Assert-Exit "Could not inspect deployed functions."
  $functions = @($functionsRaw | ConvertFrom-Json)
  if ($functions.Count -ne 1 -or $functions[0].name -ne "rfx-private-resolver" -or $functions[0].status -ne "ACTIVE") {
    throw "The staging branch does not contain exactly one active resolver function."
  }

  $networkRaw = & npx --yes supabase network-restrictions get --experimental --project-ref $BranchProjectRef --output json
  Assert-Exit "Could not inspect network restrictions."
  $network = $networkRaw | ConvertFrom-Json
  $v4 = @($network.config.dbAllowedCidrs)
  $v6 = @($network.config.dbAllowedCidrsV6)
  if ($network.status -ne "applied" -or $v4.Count -ne 1 -or $v6.Count -ne 0 -or $v4 -contains "0.0.0.0/0" -or $v6 -contains "::/0") {
    throw "Direct database network access is not narrowly restricted."
  }

  $stage = "preflight"
  & "$PSScriptRoot/run-rfx-private-resolver-staging-health.ps1" -ParentProjectRef $ParentProjectRef -BranchName $BranchName | Out-Host
  Assert-Exit "Preflight health failed."

  $stage = "synthetic-canary"
  & "$PSScriptRoot/configure-rfx-private-resolver-staging.ps1" -ParentProjectRef $ParentProjectRef -BranchName $BranchName -BranchProjectRef $BranchProjectRef | Out-Host
  Assert-Exit "Synthetic canary failed."

  $stage = "postflight"
  & "$PSScriptRoot/run-rfx-private-resolver-staging-health.ps1" -ParentProjectRef $ParentProjectRef -BranchName $BranchName | Out-Host
  Assert-Exit "Postflight health failed."

  $stage = "closeout"
  & "$PSScriptRoot/disable-rfx-private-resolver-staging.ps1" -BranchProjectRef $BranchProjectRef | Out-Host
  Assert-Exit "Final disable failed."
  & "$PSScriptRoot/run-rfx-private-resolver-staging-health.ps1" -ParentProjectRef $ParentProjectRef -BranchName $BranchName | Out-Host
  Assert-Exit "Closeout health failed."

  [pscustomobject]@{
    status = "PASS"
    contractVersion = "rateware.private-resolver.supervised-session.v1"
    mode = "FIXTURE_ONLY_TECHNICAL_REHEARSAL"
    startedAt = $startedAt.ToString("o")
    endedAt = (Get-Date).ToUniversalTime().ToString("o")
    checkpoints = @("preflight", "synthetic-canary", "postflight", "closeout")
    automatedEvidenceObserver = $true
    namedHumanOperatorRecorded = $false
    namedHumanObserverRecorded = $false
    actualHumanPilotExecuted = $false
    finalCanaryState = "DISABLED"
    liveExecution = "BLOCKED"
    productionApproved = $false
    externalBusinessEffects = $false
  } | ConvertTo-Json
}
catch {
  Write-Warning "Session stopped at stage: $stage"
  & "$PSScriptRoot/disable-rfx-private-resolver-staging.ps1" -BranchProjectRef $BranchProjectRef | Out-Host
  throw
}
finally {
  $branch = $null
  $functions = $null
  $network = $null
  $v4 = $null
  $v6 = $null
}
