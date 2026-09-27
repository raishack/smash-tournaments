param(
    [switch]$Initialize,
    [string]$Config = "branding.local.json",
    [string]$Logo = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
    if ($Initialize) {
        & node scripts/configure.mjs --init
    } elseif ($Logo) {
        & node scripts/configure.mjs --config $Config --logo $Logo
    } else {
        & node scripts/configure.mjs --config $Config
    }
    if ($LASTEXITCODE -ne 0) { throw "Configuration failed. See the message above." }
} finally { Pop-Location }
