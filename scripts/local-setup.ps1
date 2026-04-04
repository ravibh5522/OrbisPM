param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 scripts/setup-local.py @ScriptArgs
    exit $LASTEXITCODE
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    & python scripts/setup-local.py @ScriptArgs
    exit $LASTEXITCODE
}

Write-Error "Python 3 is required to run scripts/setup-local.py"
exit 1
