# Human-authorized SQL only. Ephemeral cached PostgreSQL; no network or host data.
[CmdletBinding()]
param([switch]$SqlAuthorized)
$ErrorActionPreference = 'Stop'
if (-not $SqlAuthorized) { throw 'Human authorization required for this local SQL rehearsal; see docs/catalog-owner-isolation-local.md.' }
$testRoot = Split-Path -Parent $PSScriptRoot
$testImage = 'sha256:7296f210ae81031ec955dbad9a67a84fe958572a2153b8d0826a647522904dc1'
$testName = 'catalog-owner-test-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$testContainerId = $null
$testJobs = @()
$suiteCompleted = $false
$suiteError = $null
$cleanupError = $null
function Invoke-CatalogDocker {
  param([string[]]$DockerArgs)
  $output = & docker @DockerArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Docker $($DockerArgs[0]) failed: $($output -join "`n")" }
  return $output
}
function Wait-CatalogActivity {
  param([string]$Predicate)
  $deadline = [System.Diagnostics.Stopwatch]::StartNew()
  while ($deadline.Elapsed.TotalSeconds -lt 4) {
    $found = Invoke-CatalogDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-At','-U','postgres','-d','catalog_owner_test','-c',"select exists(select 1 from pg_stat_activity a where datname='catalog_owner_test' and $Predicate);")
    if (($found -join '').Trim() -eq 't') { return }
    Start-Sleep -Milliseconds 150
  }
  throw "Required actual connection overlap not observed: $Predicate"
}
function Start-CatalogWorker {
  param([string]$File, [string]$Alias, [string]$PeerOwner)
  return Start-Job -ArgumentList $testContainerId,$File,$Alias,$PeerOwner -ScriptBlock {
    param($Container,$SqlFile,$AliasValue,$Owner)
    $workerOutput = & docker exec $Container psql -X -v ON_ERROR_STOP=1 -v "alias_value=$AliasValue" -v "peer_owner=$Owner" -U postgres -d catalog_owner_test -f "/tmp/$SqlFile" 2>&1
    [pscustomobject]@{ ExitCode=$LASTEXITCODE; Output=($workerOutput -join "`n") }
  }
}
try {
  $endpoint = ((Invoke-CatalogDocker -DockerArgs @('context','inspect','--format','{{.Endpoints.docker.Host}}')) -join '').Trim()
  if ($endpoint -notmatch '^(npipe|unix)://') { throw 'Local Docker socket required; TCP/SSH contexts are outside this authorization.' }
  $testContainerId = ((Invoke-CatalogDocker -DockerArgs @('run','--detach','--pull=never','--network=none','--name',$testName,'--label','marksman.catalog-owner-test=true','--tmpfs','/var/lib/postgresql/data:rw','--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_DB=catalog_owner_test',$testImage)) -join '').Trim()
  if ($testContainerId -notmatch '^[0-9a-f]{64}$') { throw 'Unexpected container ID; automatic cleanup forbidden.' }
  $ready = $false
  for ($attempt=0; $attempt -lt 20; $attempt++) {
    & docker exec $testContainerId pg_isready -U postgres -d catalog_owner_test | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready=$true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }
  Invoke-CatalogDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-U','postgres','-d','catalog_owner_test','-c','select version();')
  foreach ($name in @('fixture','statements','first','second','check')) {
    $fileName = "catalog-owner-$name.sql"
    Invoke-CatalogDocker -DockerArgs @('cp',(Join-Path $testRoot "tests/sql/$fileName"),"${testContainerId}:/tmp/$fileName") | Out-Null
  }
  foreach ($name in @('fixture','statements')) {
    Invoke-CatalogDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','catalog_owner_test','-f',"/tmp/catalog-owner-$name.sql")
  }
  foreach ($case in @(@{Alias='Concurrent foreign'; Owner='org:b'; Updates='0'},@{Alias='Concurrent own'; Owner='org:a'; Updates='1'})) {
    $first = Start-CatalogWorker -File 'catalog-owner-first.sql' -Alias $case.Alias -PeerOwner $case.Owner
    $testJobs += $first
    Wait-CatalogActivity -Predicate "a.application_name='catalog-owner-first' and a.wait_event='PgSleep'"
    $second = Start-CatalogWorker -File 'catalog-owner-second.sql' -Alias $case.Alias -PeerOwner $case.Owner
    $testJobs += $second
    Wait-CatalogActivity -Predicate "a.application_name='catalog-owner-second' and exists(select 1 from pg_stat_activity b where b.application_name='catalog-owner-first' and b.pid=any(pg_blocking_pids(a.pid)))"
    Write-Output "Observed real peer blocking: $($case.Alias)"
    $finished = @(Wait-Job -Job @($first,$second) -Timeout 20)
    if ($finished.Count -ne 2) { throw 'Concurrent workers exceeded timeout.' }
    foreach ($worker in @($first,$second)) {
      $result = @(Receive-Job -Job $worker)
      if ($worker.State -ne 'Completed' -or $result.Count -ne 1 -or $result[0].ExitCode -ne 0) { throw "Concurrent worker failed: $($result | Out-String)" }
      Write-Output $result[0].Output
    }
    Invoke-CatalogDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-v','ON_ERROR_STOP=1','-v',"alias_value=$($case.Alias)",'-v',"expected_updates=$($case.Updates)",'-U','postgres','-d','catalog_owner_test','-f','/tmp/catalog-owner-check.sql')
  }
  $suiteCompleted = $true
} catch { $suiteError = $_ }
finally {
  try {
    foreach ($worker in $testJobs) { if ($worker.State -notin @('Completed','Failed','Stopped')) { Stop-Job -Job $worker }; Remove-Job -Job $worker }
    if ($testContainerId -match '^[0-9a-f]{64}$') {
      $meta = (Invoke-CatalogDocker -DockerArgs @('inspect',$testContainerId) | ConvertFrom-Json)[0]
      if ($meta.Id -eq $testContainerId -and $meta.Name -eq "/$testName" -and $meta.Config.Labels.'marksman.catalog-owner-test' -eq 'true') {
        Invoke-CatalogDocker -DockerArgs @('rm','--force',$testContainerId) | Out-Null
      } else { throw 'Cleanup refused: container identity/name/label mismatch.' }
    }
  } catch { $cleanupError = $_ }
}
if ($suiteError) { [Console]::Error.WriteLine("SUITE FAILED: $($suiteError.Exception.Message)") }
if ($cleanupError) { [Console]::Error.WriteLine("CLEANUP FAILED: $($cleanupError.Exception.Message)") }
if ($suiteError -or $cleanupError -or -not $suiteCompleted) { exit 1 }
Write-Output 'PASS: catalog ownership statements, real concurrency and own-container cleanup'
exit 0
