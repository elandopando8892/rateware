param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [Parameter(Mandatory = $true)][string]$MatrixPath,
  [Parameter(Mandatory = $true)][string]$SourcePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedHash = 'CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A'
$expectedArchiveEntries = 3239
$expectedStates = [ordered]@{
  build_01 = 61
  build_02 = 61
  build_03 = 68
  build_04 = 76
  build_05 = 82
  build_06 = 90
  build_07 = 96
  build_08 = 104
  build_09 = 116
  build_10 = 124
  build_11 = 132
  build_12 = 140
}
$expectedSourceDuplicates = [ordered]@{
  'build_11|control-testing|#control-testing|0|0' = @(22, 59)
}
$matrixColumns = @(
  'build',
  'ordinal',
  'state',
  'name_or_route',
  'width',
  'height',
  'source_manifest',
  'source_render_plan',
  'reference_asset',
  'source_state_identity',
  'source_duplicate_count',
  'desktop_applicability',
  'tablet_applicability',
  'mobile_applicability',
  'mapping_status',
  'target_route',
  'target_component',
  'disposition',
  'evidence'
)

function Resolve-RepositoryOutputPath {
  param(
    [Parameter(Mandatory = $true)][string]$CandidatePath,
    [Parameter(Mandatory = $true)][string]$RepositoryRoot
  )

  $absolute = if ([IO.Path]::IsPathRooted($CandidatePath)) {
    [IO.Path]::GetFullPath($CandidatePath)
  } else {
    [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $CandidatePath))
  }
  $repositoryPrefix = $RepositoryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $absolute.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Output path is outside the current checkout: $CandidatePath"
  }

  $parent = Split-Path -Parent $absolute
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw "Output directory does not exist: $parent"
  }

  $pathToInspect = $absolute
  while (-not $pathToInspect.Equals($RepositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path -LiteralPath $pathToInspect) {
      $pathInfo = Get-Item -LiteralPath $pathToInspect
      if (($pathInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Output path may not traverse a reparse point: $pathToInspect"
      }
    }
    $nextPath = Split-Path -Parent $pathToInspect
    if ([string]::IsNullOrWhiteSpace($nextPath) -or $nextPath -eq $pathToInspect) {
      throw "Unable to prove output path containment: $CandidatePath"
    }
    $pathToInspect = $nextPath
  }
  return $absolute
}

function Read-ZipText {
  param([Parameter(Mandatory = $true)][IO.Compression.ZipArchiveEntry]$Entry)

  $stream = $Entry.Open()
  $reader = [IO.StreamReader]::new($stream, [Text.UTF8Encoding]::new($false), $true)
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
    $stream.Dispose()
  }
}

function Get-UniqueEntry {
  param(
    [Parameter(Mandatory = $true)][IO.Compression.ZipArchive]$Archive,
    [Parameter(Mandatory = $true)][string]$EntryName
  )

  $matches = @($Archive.Entries | Where-Object { $_.FullName -ceq $EntryName })
  if ($matches.Count -ne 1) {
    throw "Expected exactly one archive entry '$EntryName'; found $($matches.Count)"
  }
  return $matches[0]
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
$resolvedMatrix = Resolve-RepositoryOutputPath -CandidatePath $MatrixPath -RepositoryRoot $repositoryRoot
$resolvedSource = Resolve-RepositoryOutputPath -CandidatePath $SourcePath -RepositoryRoot $repositoryRoot
if ($resolvedMatrix -eq $resolvedSource) {
  throw 'MatrixPath and SourcePath must be different files'
}

$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedArchive).Hash.ToUpperInvariant()
if ($actualHash -ne $expectedHash) {
  throw "Build 12 SHA-256 mismatch: expected $expectedHash, received $actualHash"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($resolvedArchive)
try {
  if ($archive.Entries.Count -ne $expectedArchiveEntries) {
    throw "Archive entry count drift: expected $expectedArchiveEntries, received $($archive.Entries.Count)"
  }

  $rows = [Collections.Generic.List[object]]::new()
  $sourceEntries = [Collections.Generic.List[object]]::new()
  foreach ($buildNumber in 1..12) {
    $build = 'build_{0:d2}' -f $buildNumber
    $manifestPath = "$build/BUILD_{0:d2}_ARTIFACT_MANIFEST.md" -f $buildNumber
    $renderPlanPath = if ($buildNumber -eq 1) {
      "$build/render_plan.json"
    } else {
      "$build/BUILD_{0:d2}_RENDER_PLAN.json" -f $buildNumber
    }

    $manifestEntry = Get-UniqueEntry -Archive $archive -EntryName $manifestPath
    $renderPlanEntry = Get-UniqueEntry -Archive $archive -EntryName $renderPlanPath
    if ($manifestEntry.Length -le 0 -or $renderPlanEntry.Length -le 0) {
      throw "Empty manifest or render plan for $build"
    }
    $referenceAssets = @($archive.Entries | Where-Object {
      $_.FullName -cmatch "^$([regex]::Escape($build))/[^/]+[.]html$" -and
      $_.FullName -cne "$build/index.html"
    })
    if ($referenceAssets.Count -ne 1) {
      throw "Expected exactly one non-index reference HTML asset for $build; found $($referenceAssets.Count)"
    }
    $referenceAsset = $referenceAssets[0].FullName

    try {
      $renderPlan = Read-ZipText -Entry $renderPlanEntry | ConvertFrom-Json
    } catch {
      throw "Invalid render-plan JSON for $build`: $($_.Exception.Message)"
    }
    if ($renderPlan.Count -ne $expectedStates[$build]) {
      throw "Render state count drift for $build`: expected $($expectedStates[$build]), received $($renderPlan.Count)"
    }

    $ordinals = [Collections.Generic.HashSet[int]]::new()
    foreach ($item in $renderPlan) {
      $propertyNames = @($item.PSObject.Properties.Name)
      $usesViewportSchema = $buildNumber -le 5
      $requiredProperties = if ($usesViewportSchema) {
        @('number', 'state', 'name', 'width', 'height')
      } else {
        @('sequence', 'state', 'route', 'status')
      }
      foreach ($required in $requiredProperties) {
        if ($propertyNames -cnotcontains $required) {
          throw "Missing '$required' in $build render-plan row"
        }
      }

      $state = [string]$item.state
      if ($usesViewportSchema) {
        $ordinal = [int]$item.number
        $nameOrRoute = [string]$item.name
        $width = [int]$item.width
        $height = [int]$item.height
      } else {
        $ordinal = [int]$item.sequence
        $nameOrRoute = [string]$item.route
        $width = 0
        $height = 0
      }
      if ($ordinal -le 0 -or [string]::IsNullOrWhiteSpace($state) -or [string]::IsNullOrWhiteSpace($nameOrRoute)) {
        throw "Invalid identity fields in $build render-plan row"
      }
      if ($usesViewportSchema -and ($width -le 0 -or $height -le 0)) {
        throw "Invalid viewport dimensions in $build render-plan row $ordinal"
      }
      if (-not $ordinals.Add($ordinal)) {
        throw "Duplicate ordinal $ordinal in $build"
      }

      if ($width -eq 0) {
        $desktopApplicability = 'unspecified'
        $tabletApplicability = 'unspecified'
        $mobileApplicability = 'unspecified'
      } elseif ($width -le 900) {
        $desktopApplicability = 'no'
        $tabletApplicability = 'no'
        $mobileApplicability = 'yes'
      } elseif ($width -le 1320) {
        $desktopApplicability = 'no'
        $tabletApplicability = 'yes'
        $mobileApplicability = 'no'
      } else {
        $desktopApplicability = 'yes'
        $tabletApplicability = 'no'
        $mobileApplicability = 'no'
      }
      $sourceStateIdentity = "$build|$state|$nameOrRoute|$width|$height"

      $rows.Add([pscustomobject][ordered]@{
        build = $build
        ordinal = $ordinal
        state = $state
        name_or_route = $nameOrRoute
        width = $width
        height = $height
        source_manifest = $manifestPath
        source_render_plan = $renderPlanPath
        reference_asset = $referenceAsset
        source_state_identity = $sourceStateIdentity
        source_duplicate_count = 1
        desktop_applicability = $desktopApplicability
        tablet_applicability = $tabletApplicability
        mobile_applicability = $mobileApplicability
        mapping_status = 'not_started'
        target_route = ''
        target_component = ''
        disposition = ''
        evidence = ''
      })
    }

    $sourceEntries.Add([pscustomobject][ordered]@{
      build = $build
      manifest = $manifestPath
      render_plan = $renderPlanPath
      render_states = $renderPlan.Count
    })
  }

  if ($rows.Count -ne 1150) {
    throw "Total render state count drift: expected 1150, received $($rows.Count)"
  }

  $observedDuplicateKeys = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $identityGroups = @($rows | Group-Object -Property source_state_identity)
  foreach ($identityGroup in $identityGroups) {
    foreach ($row in $identityGroup.Group) {
      $row.source_duplicate_count = $identityGroup.Count
    }
    if ($identityGroup.Count -le 1) {
      continue
    }
    if (-not $expectedSourceDuplicates.Contains($identityGroup.Name)) {
      throw "Unexpected duplicate source state identity: $($identityGroup.Name)"
    }
    $actualOrdinals = @($identityGroup.Group | ForEach-Object { [int]$_.ordinal } | Sort-Object)
    $expectedOrdinals = @($expectedSourceDuplicates[$identityGroup.Name] | Sort-Object)
    if (($actualOrdinals -join ',') -cne ($expectedOrdinals -join ',')) {
      throw "Duplicate source state identity ordinal drift for $($identityGroup.Name)"
    }
    $null = $observedDuplicateKeys.Add($identityGroup.Name)
  }
  foreach ($expectedDuplicateKey in $expectedSourceDuplicates.Keys) {
    if (-not $observedDuplicateKeys.Contains($expectedDuplicateKey)) {
      throw "Expected source duplicate is missing: $expectedDuplicateKey"
    }
  }

  $csvLines = @($rows | Select-Object $matrixColumns | ConvertTo-Csv -NoTypeInformation)
  $sourceDocument = [pscustomobject][ordered]@{
    schema_version = 1
    archive_filename = [IO.Path]::GetFileName($resolvedArchive)
    sha256 = $actualHash
    archive_entries = $archive.Entries.Count
    render_states = $rows.Count
    states_by_build = [pscustomobject]$expectedStates
    source_entries = $sourceEntries
  }
  $sourceJson = $sourceDocument | ConvertTo-Json -Depth 5
  $utf8WithoutBom = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllLines($resolvedMatrix, $csvLines, $utf8WithoutBom)
  [IO.File]::WriteAllText($resolvedSource, $sourceJson + [Environment]::NewLine, $utf8WithoutBom)

  Write-Output "Platform55 inventory generated: builds=12 states=$($rows.Count) entries=$($archive.Entries.Count)"
} finally {
  $archive.Dispose()
}
