param(
  [Parameter(Mandatory = $true)]
  [string]$ParentProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$BranchName,

  [Parameter(Mandatory = $true)]
  [string]$BranchProjectRef
)

$ErrorActionPreference = "Stop"
$keyId = "marksman-loads-staging-2026-09-01"
$secretFile = [IO.Path]::GetTempFileName()
$toggleFile = [IO.Path]::GetTempFileName()

try {
  $branchJson = & npx --yes supabase branches get $BranchName --project-ref $ParentProjectRef --output json
  if ($LASTEXITCODE -ne 0) { throw "Could not retrieve staging branch credentials." }
  $branch = $branchJson | ConvertFrom-Json
  if (-not $branch.SUPABASE_URL -or -not $branch.SUPABASE_SERVICE_ROLE_KEY) {
    throw "Staging branch credentials are incomplete."
  }

  $secretBytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
  $sharedSecret = [Convert]::ToBase64String($secretBytes)

  @(
    "RATEWARE_SUPABASE_SERVICE_ROLE_KEY=$($branch.SUPABASE_SERVICE_ROLE_KEY)"
    "RATEWARE_PRIVATE_RESOLVER_SHARED_SECRET=$sharedSecret"
    "RATEWARE_PRIVATE_RESOLVER_KEY_ID=$keyId"
    "RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED=true"
  ) | Set-Content -LiteralPath $secretFile -Encoding utf8

  & npx --yes supabase secrets set --project-ref $BranchProjectRef --env-file $secretFile | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Staging secret configuration failed." }

  & npx --yes supabase functions deploy rfx-private-resolver --project-ref $BranchProjectRef --no-verify-jwt --use-api | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Staging function deployment failed." }

  $env:MARKSMAN_STAGING_SUPABASE_URL = $branch.SUPABASE_URL
  $env:RATEWARE_PRIVATE_RESOLVER_SHARED_SECRET = $sharedSecret
  $env:RATEWARE_PRIVATE_RESOLVER_KEY_ID = $keyId

  Start-Sleep -Seconds 5
  & node tools/run-rfx-private-resolver-staging-canary.mjs | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Enabled staging canary failed." }

  "RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED=false" | Set-Content -LiteralPath $toggleFile -Encoding utf8
  & npx --yes supabase secrets set --project-ref $BranchProjectRef --env-file $toggleFile | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Staging kill switch update failed." }

  Start-Sleep -Seconds 8
  & node tools/run-rfx-private-resolver-staging-canary.mjs --expect-disabled | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Staging kill switch verification failed." }

  [pscustomobject]@{
    status = "PASS"
    branchProjectRef = $BranchProjectRef
    function = "rfx-private-resolver"
    secretsConfigured = 4
    fixtureCanary = "passed"
    exactReplay = "passed"
    liveExecution = "blocked"
    tampering = "blocked"
    rollback = "kill_switch_verified"
    finalCanaryState = "disabled"
    externalBusinessEffects = $false
  } | ConvertTo-Json
}
finally {
  Remove-Item -LiteralPath $secretFile, $toggleFile -Force -ErrorAction SilentlyContinue
  Remove-Item Env:MARKSMAN_STAGING_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:RATEWARE_PRIVATE_RESOLVER_SHARED_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:RATEWARE_PRIVATE_RESOLVER_KEY_ID -ErrorAction SilentlyContinue
  $sharedSecret = $null
  $secretBytes = $null
  $branch = $null
}
