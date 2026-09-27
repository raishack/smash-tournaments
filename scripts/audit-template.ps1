$ErrorActionPreference = "Stop"
& node (Join-Path $PSScriptRoot "audit-template.mjs")
exit $LASTEXITCODE
