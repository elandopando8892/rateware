# Prepared runner; requires explicit human authorization to execute SQL.
[CmdletBinding()]
param([switch]$SqlAuthorized)
$ErrorActionPreference = 'Stop'
if (-not $SqlAuthorized) { throw 'Human authorization required; see docs/rebotes-transaccion-local.md.' }
$testRoot = Split-Path -Parent $PSScriptRoot
$testImage = 'sha256:7296f210ae81031ec955dbad9a67a84fe958572a2153b8d0826a647522904dc1'
$testName = 'bidware-bounce-test-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$testContainerId = $null
function Invoke-TestDocker {
  param([string[]]$DockerArgs)
  $output = & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($DockerArgs[0])" }
  return $output
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
} finally {
  if ($testContainerId -match '^[0-9a-f]{64}$') {
    $testMetadata = (Invoke-TestDocker -DockerArgs @('inspect',$testContainerId) | ConvertFrom-Json)[0]
    if ($testMetadata.Id -eq $testContainerId -and $testMetadata.Name -eq "/$testName" -and $testMetadata.Config.Labels.'bidware.bounce-test' -eq 'true') {
      Invoke-TestDocker -DockerArgs @('rm','--force',$testContainerId) | Out-Null
    } else { throw 'Cleanup refused: container identity does not match the test created here.' }
  }
}
