# Isolated runner; requires explicit human authorization to execute SQL.
[CmdletBinding()]
param([switch]$SqlAuthorized)
$ErrorActionPreference = 'Stop'
if (-not $SqlAuthorized) { throw 'Human authorization required; see docs/rebotes-transaccion-local.md.' }
$testRoot = Split-Path -Parent $PSScriptRoot
$testImage = 'sha256:7296f210ae81031ec955dbad9a67a84fe958572a2153b8d0826a647522904dc1'
$testName = 'bidware-bounce-test-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$testContainerId = $null
$testJobs = @()
function Invoke-TestDocker {
  param([string[]]$DockerArgs)
  $output = & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($DockerArgs[0])" }
  return $output
}
function Wait-TestActivity {
  param([string]$Predicate)
  $deadline = [System.Diagnostics.Stopwatch]::StartNew()
  while ($deadline.Elapsed.TotalSeconds -lt 6) {
    $found = Invoke-TestDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-At','-U','postgres','-d','bidware_bounce_test','-c',"select exists(select 1 from pg_stat_activity a where datname='bidware_bounce_test' and $Predicate);")
    if (($found -join '').Trim() -eq 't') { return }
    Start-Sleep -Milliseconds 200
  }
  throw "Required overlapping session state not observed: $Predicate"
}
function Start-TestWorker {
  param([string]$SqlFile, [string]$VendorId, [string]$Email, [string]$OperationId)
  return Start-Job -ArgumentList $testContainerId,$SqlFile,$VendorId,$Email,$OperationId -ScriptBlock {
    param($ContainerId,$File,$Vendor,$Bounce,$Operation)
    $workerOutput = & docker exec $ContainerId psql -X -v ON_ERROR_STOP=1 -U postgres -d bidware_bounce_test `
      -v "vendor_id=$Vendor" -v "bounced_email=$Bounce" -v "operation_id=$Operation" -f "/tmp/$File" 2>&1
    [pscustomobject]@{ ExitCode=$LASTEXITCODE; Output=($workerOutput -join "`n") }
  }
}
try {
  # Cached PostgreSQL 17 only: no pull, network, host ports, bind mounts or persistent volume.
  $testContainerId = (Invoke-TestDocker -DockerArgs @('run','--detach','--pull=never','--network=none','--name',$testName,
    '--label','bidware.bounce-test=true','--tmpfs','/var/lib/postgresql/data:rw',
    '--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_DB=bidware_bounce_test',$testImage)).Trim()
  if ($testContainerId -notmatch '^[0-9a-f]{64}$') { throw 'Unexpected container id; do not remove any container automatically.' }
  $ready = $false
  for ($attempt=0; $attempt -lt 20; $attempt++) {
    & docker exec $testContainerId pg_isready -U postgres -d bidware_bounce_test | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready=$true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }
  Invoke-TestDocker -DockerArgs @('exec',$testContainerId,'psql','-U','postgres','-d','bidware_bounce_test','-c','select version();')
  $sqlFiles = @('tests/sql/vendor-bounce-fixture.sql','supabase/migrations/20261002072000_resolve_vendor_bounce_atomic.sql','tests/sql/vendor-bounce-atomic.sql')
  foreach ($relative in $sqlFiles) {
    $sqlFile = Join-Path $testRoot $relative
    Invoke-TestDocker -DockerArgs @('cp',$sqlFile,"${testContainerId}:/tmp/bounce-test.sql")
    Invoke-TestDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','bidware_bounce_test','-f','/tmp/bounce-test.sql')
  }
  $concurrencyFiles = @('seed','first','replay','conflict','check')
  foreach ($name in $concurrencyFiles) {
    $fileName = "vendor-bounce-concurrency-$name.sql"
    Invoke-TestDocker -DockerArgs @('cp',(Join-Path $testRoot "tests/sql/$fileName"),"${testContainerId}:/tmp/$fileName")
  }
  Invoke-TestDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','bidware_bounce_test','-f','/tmp/vendor-bounce-concurrency-seed.sql')
  foreach ($case in @(@{Vendor='100'; Operation='102'; Peer='replay'},@{Vendor='200'; Operation='202'; Peer='conflict'})) {
    $vendorId = '00000000-0000-4000-8000-' + $case.Vendor.PadLeft(12,'0')
    $operationId = '00000000-0000-4000-8000-' + $case.Operation.PadLeft(12,'0')
    $first = Start-TestWorker -SqlFile 'vendor-bounce-concurrency-first.sql' -VendorId $vendorId -Email "bad$($case.Vendor)@example.test" -OperationId $operationId
    $testJobs += $first
    # The first has resolved the contact but deliberately holds its transaction open.
    Wait-TestActivity -Predicate "a.application_name='bounce-first' and a.wait_event='PgSleep'"
    $second = Start-TestWorker -SqlFile "vendor-bounce-concurrency-$($case.Peer).sql" -VendorId $vendorId -Email '' -OperationId ''
    $testJobs += $second
    # Require direct observed blocking, rather than infer concurrency from two launches.
    Wait-TestActivity -Predicate "a.application_name='bounce-second' and exists(select 1 from pg_stat_activity b where b.application_name='bounce-first' and b.pid=any(pg_blocking_pids(a.pid)))"
    Write-Output "Observed peer blocked by first connection: $($case.Peer)"
    $finished = @(Wait-Job -Job @($first,$second) -Timeout 25)
    if ($finished.Count -ne 2) { throw 'Concurrent workers did not finish within 25 seconds.' }
    foreach ($worker in @($first,$second)) {
      $workerResult = @(Receive-Job -Job $worker)
      if ($worker.State -ne 'Completed' -or $workerResult.Count -ne 1 -or $workerResult[0].ExitCode -ne 0) {
        throw "Concurrent worker failed: $($workerResult[0].Output)"
      }
      if ($worker.Id -eq $first.Id -and $workerResult[0].Output -notmatch '"replayed": false') {
        throw 'First correction did not return a new receipt.'
      }
      Write-Output $workerResult[0].Output
    }
  }
  Invoke-TestDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','bidware_bounce_test','-f','/tmp/vendor-bounce-concurrency-check.sql')
  foreach ($relative in @('docs/sql/rollback-resolve-vendor-bounce.sql','tests/sql/vendor-bounce-rollback-check.sql')) {
    Invoke-TestDocker -DockerArgs @('cp',(Join-Path $testRoot $relative),"${testContainerId}:/tmp/bounce-rollback.sql")
    Invoke-TestDocker -DockerArgs @('exec',$testContainerId,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','bidware_bounce_test','-f','/tmp/bounce-rollback.sql')
  }
} finally {
  foreach ($worker in $testJobs) {
    if ($worker.State -notin @('Completed','Failed','Stopped')) { Stop-Job -Job $worker }
    Remove-Job -Job $worker
  }
  if ($testContainerId -match '^[0-9a-f]{64}$') {
    $testMetadata = (Invoke-TestDocker -DockerArgs @('inspect',$testContainerId) | ConvertFrom-Json)[0]
    if ($testMetadata.Id -eq $testContainerId -and $testMetadata.Name -eq "/$testName" -and $testMetadata.Config.Labels.'bidware.bounce-test' -eq 'true') {
      Invoke-TestDocker -DockerArgs @('rm','--force',$testContainerId) | Out-Null
    } else { throw 'Cleanup refused: container identity does not match the test created here.' }
  }
}
