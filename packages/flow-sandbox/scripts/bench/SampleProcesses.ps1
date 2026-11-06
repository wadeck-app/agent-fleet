# Prints one JSON array of every process: name, id, working set (bytes), total cpu seconds. Read-only; the caller
# (BenchSampler.mjs) reduces it by process name. Usage: powershell -NoProfile -File SampleProcesses.ps1
$rows = Get-Process | ForEach-Object {
	[pscustomobject]@{ n = $_.ProcessName; i = $_.Id; w = $_.WorkingSet64; c = [math]::Round([double]$_.CPU, 2) }
}
ConvertTo-Json -InputObject @($rows) -Compress
