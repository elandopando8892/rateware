param(
  [Parameter(Mandatory = $true)]
  [string]$BranchProjectRef
)

$ErrorActionPreference = "Stop"
$toggleFile = [IO.Path]::GetTempFileName()

try {
  "RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED=false" | Set-Content -LiteralPath $toggleFile -Encoding utf8
  & npx --yes supabase secrets set --project-ref $BranchProjectRef --env-file $toggleFile | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Could not disable the staging canary." }

  [pscustomobject]@{
    status = "PASS"
    branchProjectRef = $BranchProjectRef
    canary = "disabled"
    liveExecution = "not_implemented"
    productionMutation = $false
  } | ConvertTo-Json
}
finally {
  Remove-Item -LiteralPath $toggleFile -Force -ErrorAction SilentlyContinue
}
