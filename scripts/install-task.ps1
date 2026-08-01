param(
  [ValidatePattern('^\d{2}:\d{2}$')]
  [string]$Time = '09:00',
  [string]$TaskName = 'Steam Radar'
)

$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $PSScriptRoot
$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$Action = New-ScheduledTaskAction `
  -Execute $Npm `
  -Argument 'run daily' `
  -WorkingDirectory $ProjectDir
$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 15)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description 'Steamworks etkinliklerini ve son tarihlerini günceller; yapılandırılmışsa günlük e-posta yollar.' `
  -Force | Out-Null

Write-Host "Görev kuruldu: $TaskName (her gün $Time)"
