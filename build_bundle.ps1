$ErrorActionPreference = "Stop"
$baseDir = $PSScriptRoot

$utf8 = [System.Text.Encoding]::UTF8
$sb = New-Object System.Text.StringBuilder

# Read index.html
$indexHtml = [System.IO.File]::ReadAllText("$baseDir\index.html", $utf8)

# Find CSS link position
$cssMarker = '<link rel="stylesheet" href="css/style.css">'
$cssPos = $indexHtml.IndexOf($cssMarker)

if ($cssPos -lt 0) {
    throw "Cannot find CSS link marker in index.html"
}

# Append HTML before CSS
[void]$sb.Append($indexHtml.Substring(0, $cssPos))

# Append embedded CSS
$cssContent = [System.IO.File]::ReadAllText("$baseDir\css\style.css", $utf8)
[void]$sb.Append("<style>`n")
[void]$sb.Append($cssContent)
[void]$sb.Append("`n</style>")

# Find Scripts marker
$scriptMarker = '<script src="js/data.js"></script>'
$scriptPos = $indexHtml.IndexOf($scriptMarker)

if ($scriptPos -lt 0) {
    throw "Cannot find script marker in index.html"
}

# Append HTML between CSS and Scripts
$afterCssPos = $cssPos + $cssMarker.Length
[void]$sb.Append($indexHtml.Substring($afterCssPos, $scriptPos - $afterCssPos))

# List of JS files in exact dependency order
$jsFiles = @(
    "js\data.js",
    "js\api.js",
    "js\charts.js",
    "js\modules\intraday.js",
    "js\modules\cutoff.js",
    "js\modules\cohort.js",
    "js\modules\channel.js",
    "js\modules\productMetrics.js",
    "js\modules\compareVersion.js",
    "js\modules\templates.js",
    "js\modules\tactics.js",
    "js\modules\packages.js",
    "js\modules\creatives.js",
    "js\modules\monetization.js",
    "js\modules\business.js",
    "js\modules\admin.js",
    "js\modules\dataManagement.js",
    "js\modules\realtimeEngine.js",
    "js\app.js"
)

foreach ($relPath in $jsFiles) {
    $fullPath = Join-Path $baseDir $relPath
    if (-not (Test-Path $fullPath)) {
        throw "File not found: $fullPath"
    }
    $jsCode = [System.IO.File]::ReadAllText($fullPath, $utf8)
    [void]$sb.Append("`n<script>`n")
    [void]$sb.Append("/* --- Inlined: $relPath --- */`n")
    [void]$sb.Append($jsCode)
    [void]$sb.Append("`n</script>`n")
}

# Append bootstrap runner and closing tags
[void]$sb.Append(@"
<script>
    function runInit() {
        if (window.App && typeof window.App.init === 'function') {
            window.App.init();
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInit);
    } else {
        runInit();
    }
</script>
</body>
</html>
"@)

# Write output file
$outputPath = "$baseDir\MKTPRO_APP.html"
[System.IO.File]::WriteAllText($outputPath, $sb.ToString(), $utf8)

Write-Host "Successfully built standalone bundle: $outputPath ($($sb.Length) chars)"
