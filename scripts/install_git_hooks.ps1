$ErrorActionPreference = 'Stop'

$root = (git rev-parse --show-toplevel).Trim()
if (-not $root) {
  throw "Not inside a git repository."
}

$source = Join-Path $root 'scripts\git-hooks\pre-push'
$hooksDir = Join-Path $root '.git\hooks'
$target = Join-Path $hooksDir 'pre-push'

if (-not (Test-Path $source)) {
  throw "Hook source not found: $source"
}
if (-not (Test-Path $hooksDir)) {
  New-Item -ItemType Directory -Path $hooksDir | Out-Null
}

if (Test-Path $target) {
  $backup = "$target.bak-" + (Get-Date -Format 'yyyyMMddHHmmss')
  Copy-Item $target $backup
  Write-Host "Backed up existing pre-push hook to $backup"
}

Copy-Item $source $target -Force
Write-Host "Installed pre-push hook: $target"

# Remove the legacy post-commit hook installed by earlier versions of this
# project so data is published once per push, not once per commit.
$legacy = Join-Path $hooksDir 'post-commit'
if (Test-Path $legacy) {
  $content = Get-Content $legacy -Raw
  if ($content -match 'publish_data_release\.py') {
    $backup = "$legacy.bak-" + (Get-Date -Format 'yyyyMMddHHmmss')
    Move-Item $legacy $backup
    Write-Host "Removed legacy post-commit hook (backup: $backup)"
  } else {
    Write-Warning "Found an unrelated post-commit hook at $legacy; left it untouched."
  }
}

$hooksPath = git config --get core.hooksPath
if ($LASTEXITCODE -eq 0 -and $hooksPath) {
  Write-Warning "core.hooksPath is set to '$hooksPath'; the installed hook may not run."
}

Write-Host "Set GRS_GITHUB_TOKEN before pushing."
Write-Host "See README: 数据、备份与恢复 > GitHub Releases 自动快照"
