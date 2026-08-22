param(
    [string]$InputDirectory = (Join-Path $PSScriptRoot "..\..\generated\report-docx"),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\..\generated\report-pdf")
)

$ErrorActionPreference = "Stop"
$word = $null
$document = $null
$wdExportFormatPDF = 17
$wdExportOptimizeForPrint = 0
$wdExportAllDocument = 0
$wdExportDocumentContent = 0
$wdExportCreateHeadingBookmarks = 1

try {
    try {
        $word = New-Object -ComObject Word.Application
    }
    catch {
        throw "Microsoft Word could not be started. PDF publishing requires Microsoft Word desktop on Windows."
    }
    $word.Visible = $false
    $word.DisplayAlerts = 0
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

    foreach ($locale in @("en", "zh-CN")) {
        $inputPath = [System.IO.Path]::GetFullPath((Join-Path $InputDirectory "report-$locale.docx"))
        $outputPath = [System.IO.Path]::GetFullPath((Join-Path $OutputDirectory "report-$locale.pdf"))
        if (-not (Test-Path -LiteralPath $inputPath -PathType Leaf)) {
            throw "Localized DOCX is missing: $inputPath"
        }
        try {
            $document = $word.Documents.Open($inputPath, $false, $true)
            $document.Fields.Update() | Out-Null
            foreach ($section in $document.Sections) {
                foreach ($header in $section.Headers) { $header.Range.Fields.Update() | Out-Null }
                foreach ($footer in $section.Footers) { $footer.Range.Fields.Update() | Out-Null }
            }
            $document.ExportAsFixedFormat(
                $outputPath,
                $wdExportFormatPDF,
                $false,
                $wdExportOptimizeForPrint,
                $wdExportAllDocument,
                1,
                1,
                $wdExportDocumentContent,
                $true,
                $true,
                $wdExportCreateHeadingBookmarks,
                $true,
                $true,
                $false
            )
            Write-Host "[report] Exported $outputPath"
        }
        finally {
            if ($null -ne $document) {
                $document.Close($false)
                [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
                $document = $null
            }
        }
    }
}
catch {
    Write-Error "[report] $($_.Exception.Message)"
    exit 1
}
finally {
    if ($null -ne $document) {
        $document.Close($false)
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document)
    }
    if ($null -ne $word) {
        $word.Quit()
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
