# Batch capture the Oracle Trust Calibration openings series.
#
# For each registered Track A lesson episode:
#   - Capture the LONG-FORM in landscape (1920x1080) — for YouTube long-form
#   - Capture the VARIATION shorts in portrait (1080x1920) — for vertical / Shorts
#
# This matches the channel's actual upload pattern (per the user's
# 2026-05-21 feedback: "horizontal long-form, vertical clips") and
# halves capture time vs the default dual-orientation render.
#
# Output paths land where the existing pipeline writes:
#   exports/<episode>/<episode>.mp4              landscape long-form
#   exports/<episode>/<episode>_tight.mp4        dead-air-compressed sibling
#   exports/<episode>/variations/<vid>_portrait.mp4  portrait variations
#
# (Note: --portrait-only flips the no-suffix default, so the variation
# filenames will follow the _portrait convention.)
#
# Run from the repo root:
#   ./scripts/export-openings-series.ps1
#
# Best run as a background task so you can leave it for ~6 hours.
# Per-episode wallclock: ~70 min (1 landscape full + 4 portrait variations).

$ErrorActionPreference = 'Continue'

$episodes = @(
  'italian_game_lesson',
  'ruy_lopez_lesson',
  'sicilian_najdorf_lesson',
  'french_winawer_lesson',
  'qgd_orthodox_lesson'
)

$logRoot = Join-Path (Get-Location) 'exports/_batch-logs'
if (-not (Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot -Force | Out-Null }
$batchStart = Get-Date
$batchStartStamp = $batchStart.ToString('yyyy-MM-dd_HHmmss')
$summaryPath = Join-Path $logRoot "summary_$batchStartStamp.log"

function Log-Line($msg) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -Path $summaryPath -Value $line
}

Log-Line "=== Openings series batch starting ==="
Log-Line "Episodes: $($episodes -join ', ')"

foreach ($ep in $episodes) {
  $epStart = Get-Date

  # Long-form — landscape only.
  $longLog = Join-Path $logRoot "${ep}_long_$batchStartStamp.log"
  Log-Line "[$ep] long-form landscape -> $longLog"
  try {
    npm run export:game -- --episode $ep --landscape-only *>&1 | Tee-Object -FilePath $longLog | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Log-Line "[$ep] long-form FAILED (exit $LASTEXITCODE) — continuing to variations"
    } else {
      Log-Line "[$ep] long-form OK"
    }
  } catch {
    Log-Line "[$ep] long-form THREW: $_"
  }

  # Variations — portrait only.
  $varLog = Join-Path $logRoot "${ep}_variations_$batchStartStamp.log"
  Log-Line "[$ep] variations portrait -> $varLog"
  try {
    npm run export:game -- --episode $ep --all-variations --portrait-only *>&1 | Tee-Object -FilePath $varLog | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Log-Line "[$ep] variations FAILED (exit $LASTEXITCODE) — continuing to next episode"
    } else {
      Log-Line "[$ep] variations OK"
    }
  } catch {
    Log-Line "[$ep] variations THREW: $_"
  }

  $epElapsed = (Get-Date) - $epStart
  Log-Line "[$ep] done in $($epElapsed.ToString('hh\:mm\:ss'))"
}

$batchElapsed = (Get-Date) - $batchStart
Log-Line "=== Batch complete in $($batchElapsed.ToString('hh\:mm\:ss')) ==="
Log-Line "Summary: $summaryPath"
