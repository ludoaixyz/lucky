param([string]$Python = "python")

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$tool = Join-Path $PSScriptRoot "report_i18n.py"

Push-Location $root
try {
    & $Python $tool sync
    if ($LASTEXITCODE -ne 0) { throw "Localization sync failed." }
    & $Python $tool validate
    if ($LASTEXITCODE -ne 0) { throw "Localization validation failed. Update missing or stale zh-CN entries before publishing." }
    & $Python $tool build
    if ($LASTEXITCODE -ne 0) { throw "Localized DOCX generation failed." }
    & (Join-Path $PSScriptRoot "export_pdf.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Microsoft Word PDF export failed." }
    & $Python (Join-Path $PSScriptRoot "publish_assets.py")
    if ($LASTEXITCODE -ne 0) { throw "Static PDF publishing failed." }
    Write-Host "[report] Local report publish complete. Review generated/report-pdf before committing."
}
finally {
    Pop-Location
}
