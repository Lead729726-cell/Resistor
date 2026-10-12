param([string]$LessonId,[string]$TaskRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
if(!$TaskRoot){$TaskRoot=Split-Path $PSScriptRoot -Parent}
$taskRoot=$TaskRoot
$taskPlan=Get-Content -LiteralPath (Join-Path $taskRoot 'scripts/physical-tutorial-plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskSynth=[System.Speech.Synthesis.SpeechSynthesizer]::new()
$taskSynth.SelectVoice('Microsoft Heami Desktop')
$taskSynth.Rate=0
try {
 foreach($taskLesson in $taskPlan.lessons) {
  if($LessonId -and $taskLesson.id -ne $LessonId){continue}
  $taskOut=Join-Path $taskRoot ('release/tutorials/'+$taskLesson.id)
  $taskAudio=Join-Path $taskOut 'audio'
  New-Item -ItemType Directory -Path $taskAudio -Force | Out-Null
  $taskRows=@();$taskIndex=0
  foreach($taskLine in $taskLesson.lines){
   $taskName=('{0:00}-heami.wav' -f $taskIndex)
   $taskWav=Join-Path $taskAudio $taskName
   $taskSource='physical-voice-'+[Guid]::NewGuid().ToString('N')
   $taskSubscriber=Register-ObjectEvent -InputObject $taskSynth -EventName SpeakProgress -SourceIdentifier $taskSource
   try {
    # Keep the voice's native output format. System.Speech progress offsets
    # use a different clock when an explicit resampling format is requested.
    $taskSynth.SetOutputToWaveFile($taskWav)
    $taskSynth.Speak([string]$taskLine.speech)
    $taskSynth.SetOutputToNull()
    $taskEvents=@(Get-Event -SourceIdentifier $taskSource -ErrorAction SilentlyContinue)
    $taskBounds=@($taskEvents | ForEach-Object {[PSCustomObject]@{offset=$_.SourceEventArgs.AudioPosition.Ticks;duration=1000000;text=$_.SourceEventArgs.Text}})
    if($taskBounds.Count -eq 0){throw 'Native speech word timing was not returned.'}
    $taskLine | Add-Member -NotePropertyName index -NotePropertyValue $taskIndex -Force
    $taskLine | Add-Member -NotePropertyName audio -NotePropertyValue ('audio/'+$taskName) -Force
    $taskLine | Add-Member -NotePropertyName boundaries -NotePropertyValue $taskBounds -Force
    $taskRows+= $taskLine
   } finally {Unregister-Event -SourceIdentifier $taskSource; Get-Event -SourceIdentifier $taskSource -ErrorAction SilentlyContinue | Remove-Event}
   Write-Output ($taskLesson.id+': voice '+($taskIndex+1));$taskIndex++
  }
  [PSCustomObject]@{paid_calls=0;voice='Microsoft Heami Desktop (offline Korean)';rows=$taskRows} | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskOut 'narration.json') -Encoding UTF8
 }
} finally {$taskSynth.Dispose()}
