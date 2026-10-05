$ErrorActionPreference = 'Stop'
$taskWorkspace = (Get-Location).Path
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Unsupported QA version.' }
$evidenceVersion = ($version -split '\.')[0..1] -join '.'
$qaRoot = [IO.Path]::GetFullPath((Join-Path $taskWorkspace ('.runtime/install-test/' + $version)))
$appTarget = [IO.Path]::GetFullPath((Join-Path $qaRoot 'app'))
if (-not $qaRoot.StartsWith($taskWorkspace + [IO.Path]::DirectorySeparatorChar) -or -not $appTarget.StartsWith($qaRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'QA paths escaped the workspace.' }
$installedExe = Join-Path $appTarget 'Register.exe'
if (Test-Path -LiteralPath $installedExe) { throw 'An earlier QA installation is still present.' }
$installer = (Resolve-Path -LiteralPath ('release/installers/Register-' + $version + '-win-x64.exe')).Path
$installerHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$signature = (Get-AuthenticodeSignature -LiteralPath $installer).Status.ToString()
$install = Start-Process -FilePath $installer -ArgumentList @('/S',('/D=' + $appTarget)) -WindowStyle Hidden -Wait -PassThru
if ($install.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $installedExe)) { throw ('Installer failed: ' + $install.ExitCode) }
& node tests/integration/installed-viewer.mjs
if ($LASTEXITCODE -ne 0) { throw 'Installed viewer or packaged source verification failed.' }
$marker = Join-Path $qaRoot 'user-data/keep-on-uninstall.txt'
$markerHash = (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash
$uninstallers = @(Get-ChildItem -LiteralPath $appTarget -Filter '*Uninstall*.exe' -File)
if ($uninstallers.Count -ne 1) { throw 'Expected exactly one QA uninstaller.' }
$uninstaller = [IO.Path]::GetFullPath($uninstallers[0].FullName)
if (-not $uninstaller.StartsWith($appTarget + [IO.Path]::DirectorySeparatorChar)) { throw 'Uninstaller escaped QA target.' }
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(20)
while ((Test-Path -LiteralPath $installedExe) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
$exeRemoved = -not (Test-Path -LiteralPath $installedExe)
$markerPreserved = (Test-Path -LiteralPath $marker) -and ((Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash -eq $markerHash)
if ($uninstall.ExitCode -ne 0 -or -not $exeRemoved -or -not $markerPreserved) { throw 'QA uninstall or test user data preservation failed.' }
$receipt = [ordered]@{version=$version;checked_at=[DateTime]::UtcNow.ToString('o');installer=$installer;installer_sha256=$installerHash;windows_authenticode=$signature;install_target=$appTarget;installer_exit_code=$install.ExitCode;installed_viewer_evidence=('docs/evidence/installed-viewer-' + $evidenceVersion + '.json');uninstaller_exit_code=$uninstall.ExitCode;installed_executable_removed=$exeRemoved;test_user_data_marker_preserved=$markerPreserved}
$json = $receipt | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText((Join-Path $taskWorkspace ('docs/evidence/windows-installation-' + $evidenceVersion + '.json')),$json,[Text.UTF8Encoding]::new($false))
Write-Output $json
