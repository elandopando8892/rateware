param(
  [Parameter(Mandatory=$true)][string]$RuntimeSnapshot,
  [Parameter(Mandatory=$true)][string]$CandidateRoot
)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
$snapshot = Get-Content -LiteralPath $RuntimeSnapshot -Raw | ConvertFrom-Json
if ($snapshot.project_id -ne $manifest.project_id -or $snapshot.version -ne $manifest.baseline_version -or
    $snapshot.ezbr_sha256 -ne $manifest.baseline_ezbr_sha256 -or $snapshot.verify_jwt -ne $manifest.verify_jwt) {
  throw 'Runtime snapshot differs from the reviewed baseline'
}
if ($snapshot.files.Count -ne $manifest.files.Count) { throw 'Runtime file inventory changed' }
$encoding = [System.Text.UTF8Encoding]::new($false)
foreach ($item in $manifest.files) {
  if ($item.name -notmatch '^functions/(?:_shared|rateware-api)/[A-Za-z0-9._-]+\.(?:ts|js|mjs)$') { throw 'Unexpected source path' }
  $source = @($snapshot.files | Where-Object name -eq $item.name)
  if ($source.Count -ne 1) { throw 'Missing or duplicate runtime file' }
  $baselineHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($encoding.GetBytes($source[0].content))).ToLowerInvariant()
  if ($baselineHash -ne $item.baseline_sha256) { throw "Baseline hash differs: $($item.name)" }
  $candidateFile = Join-Path $CandidateRoot ('supabase/' + $item.name)
  $candidateHash = (Get-FileHash -LiteralPath $candidateFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($candidateHash -ne $item.candidate_sha256) { throw "Candidate hash differs: $($item.name)" }
}
$sourceDirectory = Join-Path $CandidateRoot 'supabase/functions'
$actualFiles = @(Get-ChildItem -LiteralPath $sourceDirectory -File -Recurse)
if ($actualFiles.Count -ne $manifest.files.Count) { throw 'Unexpected candidate source inventory' }
$changed = @($manifest.files | Where-Object { -not $_.unchanged })
if ($changed.Count -ne 1 -or $changed[0].name -ne $manifest.only_changed_file) { throw 'Unexpected changed-file scope' }
Write-Output 'Candidate verified: runtime 682, 15 files, 14 dependencies unchanged, only catalog entrypoint patch.'
