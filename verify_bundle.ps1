$path = Join-Path $PSScriptRoot "MKTPRO_APP.html"
$c = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

Write-Host "File size:" $c.Length
$matchesHtml = [regex]::Matches($c, "</html>")
Write-Host "Count of </html>:" $matchesHtml.Count
foreach ($m in $matchesHtml) {
    Write-Host "Index:" $m.Index
}

# Check if App.init is in the file
Write-Host "Contains App.init:" $c.Contains("App.init()")
Write-Host "Contains RealtimeEngine:" $c.Contains("RealtimeEngine")
Write-Host "Contains DataManagementModule:" $c.Contains("DataManagementModule")
Write-Host "Contains IntradayModule:" $c.Contains("IntradayModule")
