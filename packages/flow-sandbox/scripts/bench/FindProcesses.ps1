# Read-only. Prints a JSON array of the processes whose command line contains any of the given literal fragments
# (separated by '|'). Used by the M8 bench to see what is left behind after a cancel / kill.
# Usage: powershell -NoProfile -File FindProcesses.ps1 -Fragments "flow-test-iso-abc|flow-sbx-xyz"
param([string]$Fragments)
$parts = @($Fragments.Split('|') | Where-Object { $_ -ne '' })
$self = $PID
$rows = Get-CimInstance Win32_Process | Where-Object {
	$line = $_.CommandLine
	if ($_.ProcessId -eq $self -or -not $line -or $line.Contains('FindProcesses.ps1')) { return $false }
	foreach ($p in $parts) { if ($line.Contains($p)) { return $true } }
	return $false
} | ForEach-Object {
	$c = $_.CommandLine
	if ($c.Length -gt 220) { $c = $c.Substring(0, 220) }
	[pscustomobject]@{ pid = $_.ProcessId; ppid = $_.ParentProcessId; name = $_.Name; cmd = $c }
}
if ($null -eq $rows) { '[]' } else { ConvertTo-Json -InputObject @($rows) -Compress }
