$dirs = @(
  'api',
  'api\cron',
  'api\cron\subscription-reminders',
  'api\platform',
  'api\platform\branding',
  'api\stripe',
  'api\stripe\webhook',
  'auth',
  'auth\confirm',
  'billing',
  'branches',
  'branding',
  'notifications',
  'offline',
  'platform',
  'platform\branding',
  'platform\settings',
  'platform\settings\branding',
  'settings',
  'settings\notifications',
  'signup',
  'staff',
  'super-admin',
  'super-admin\billing',
  'super-admin\plans',
  'super-admin\workspaces',
  'visitors',
  '_global-error.segments\_global-error'
)

$bases = @('.next\server\app', '.next\static\chunks\app', '.next\types\app')

foreach ($b in $bases) {
  foreach ($d in $dirs) {
    $target = Join-Path $b $d
    if (-not (Test-Path $target)) {
      New-Item -ItemType Directory -Force -Path $target | Out-Null
    }
  }
}

Write-Host "All build directories ensured."
