$ErrorActionPreference = 'Stop'

$root = (git rev-parse --show-toplevel).Trim()
if (-not $root) {
  throw "Not inside a git repository."
}

$source = Join-Path $root 'scripts\git-hooks\post-commit'
$hooksDir = Join-Path $root '.git\hooks'
$target = Join-Path $hooksDir 'post-commit'

if (-not (Test-Path $source)) {
  throw "Hook source not found: $source"
}
if (-not (Test-Path $hooksDir)) {
  New-Item -ItemType Directory -Path $hooksDir | Out-Null
}

if (Test-Path $target) {
  $backup = "$target.bak-" + (Get-Date -Format 'yyyyMMddHHmmss')
  Copy-Item $target $backup
  Write-Host "Backed up existing post-commit hook to $backup"
}

Copy-Item $source $target -Force
Write-Host "Installed post-commit hook: $target"

$hooksPath = git config --get core.hooksPath
if ($LASTEXITCODE -eq 0 -and $hooksPath) {
  Write-Warning "core.hooksPath is set to '$hooksPath'; the installed hook may not run."
}

Write-Host "Set GRS_GITHUB_TOKEN before committing."
Write-Host "See README: 数据、备份与恢复 > GitHub Releases 自动快照"
