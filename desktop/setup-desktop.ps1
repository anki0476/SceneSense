param([string]$Request)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class SetupWindow { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid); }'
$r=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Request))|ConvertFrom-Json
$gameName=if($r.gameName){[string]$r.gameName}else{'Asphalt Legends'};$processName=if($r.processName){[string]$r.processName -replace '\.exe$',''}else{'Asphalt9'}
function VisibleRect($node,$header=$false){$c=$node.Current;$rect=$c.BoundingRectangle;if($rect.Width -le 0 -or $rect.Height -le 0 -or $c.IsOffscreen){throw 'Control is not visible.'};@{name=$c.Name;x=$rect.X;y=$rect.Y;width=$(if($header){[Math]::Min(240,$rect.Width)}else{$rect.Width});height=$(if($header){40}else{$rect.Height})}}
function ChooseLaunchTarget($items){$open=@($items|Where-Object {$_.name -eq 'Open'});if($open.Count -eq 1){return $open[0]};$actionable=@($items|Where-Object {$_.actionable});if($actionable.Count -eq 1){return $actionable[0]};return $null}
try {
 if($r.action -eq 'dismiss_search'){
  [uint32]$foregroundProcess=0;[SetupWindow]::GetWindowThreadProcessId([SetupWindow]::GetForegroundWindow(),[ref]$foregroundProcess)|Out-Null
  $searchFocused=(Get-Process -Id $foregroundProcess).ProcessName -in @('SearchHost','SearchApp','StartMenuExperienceHost')
  if($searchFocused){(New-Object -ComObject WScript.Shell).SendKeys('{ESC}');Start-Sleep -Milliseconds 150}
  @{dismissed=$searchFocused}|ConvertTo-Json -Compress;exit
 }
 if($r.action -in @('find_game_icon','activate_game_icon','find_obs_icon','activate_obs_icon')){
  $isObs=$r.action -match 'obs_icon$';$query=if($isObs){'OBS Studio'}else{'Asphalt Legends'};$namePattern=if($isObs){'^OBS Studio(?: \(64bit\))?$'}else{'^Asphalt.*Legends'}
  if($r.action -match '^find_'){
   $existing=@(Get-Process -ErrorAction SilentlyContinue|Where-Object {($isObs -and $_.ProcessName -eq 'obs64' -or !$isObs -and $_.ProcessName -match '^Asphalt') -and $_.MainWindowHandle -ne 0})
   if($existing.Count -eq 1){[SetupWindow]::SetForegroundWindow($existing[0].MainWindowHandle)|Out-Null;Start-Sleep -Milliseconds 150;$root=[Windows.Automation.AutomationElement]::FromHandle($existing[0].MainWindowHandle);$rect=VisibleRect $root $true;$rect.alreadyOpen=$true;$rect|ConvertTo-Json -Compress;exit}
   $shell=New-Object -ComObject WScript.Shell;$shell.SendKeys('^{ESC}');Start-Sleep -Milliseconds 350
   [uint32]$foregroundProcess=0;[SetupWindow]::GetWindowThreadProcessId([SetupWindow]::GetForegroundWindow(),[ref]$foregroundProcess)|Out-Null
   if((Get-Process -Id $foregroundProcess).ProcessName -notin @('SearchHost','SearchApp','StartMenuExperienceHost')){throw 'Windows search did not take focus.'}
   $shell.SendKeys($query);Start-Sleep -Milliseconds 900
  }
  $result=@();$chosen=$null;$until=[DateTime]::UtcNow.AddSeconds(4)
  do{
   $result=@();
   $roots=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,[Windows.Automation.Condition]::TrueCondition)
   foreach($root in $roots){try{
    $proc=Get-Process -Id $root.Current.ProcessId -ErrorAction Stop;if($proc.ProcessName -notin @('SearchHost','SearchApp','StartMenuExperienceHost')){continue}
    $all=$root.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
    foreach($node in $all){$c=$node.Current;if($c.IsOffscreen -or !$c.IsEnabled -or ($c.Name -notmatch $namePattern -and $c.Name -ne 'Open')){continue};$pattern=$null;$canInvoke=$node.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$pattern);$selection=$null;$canSelect=$node.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern,[ref]$selection);$legacy=$null;$canLegacy=$node.TryGetCurrentPattern([Windows.Automation.LegacyIAccessiblePattern]::Pattern,[ref]$legacy);$id=$node.GetRuntimeId()-join '.'
     if($r.action -match '^activate_'){if($id -eq $r.control){if($canInvoke){$pattern.Invoke()}elseif($canSelect){[SetupWindow]::SetForegroundWindow([IntPtr]$root.Current.NativeWindowHandle)|Out-Null;$selection.Select();(New-Object -ComObject WScript.Shell).SendKeys('{ENTER}')}elseif($canLegacy -and $legacy.Current.DefaultAction){$legacy.DoDefaultAction()}else{[uint32]$owner=0;[SetupWindow]::GetWindowThreadProcessId([SetupWindow]::GetForegroundWindow(),[ref]$owner)|Out-Null;if((Get-Process -Id $owner).ProcessName -notin @('SearchHost','SearchApp','StartMenuExperienceHost')){throw 'Search lost focus before activation.'};$rect=VisibleRect $node;[SetupWindow]::SetCursorPos([int]($rect.x+$rect.width/2),[int]($rect.y+$rect.height/2))|Out-Null;[SetupWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[SetupWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)};@{launched=$query;method='Windows search icon'}|ConvertTo-Json -Compress;exit}}
     else{$rect=VisibleRect $node;$rect.control=$id;$rect.actionable=$canInvoke -or $canSelect -or ($canLegacy -and [bool]$legacy.Current.DefaultAction);$result+=$rect}
    }
   }catch{}}
   $chosen=ChooseLaunchTarget $result;if($null -ne $chosen){break};Start-Sleep -Milliseconds 200
  }while([DateTime]::UtcNow -lt $until)
  if($r.action -match '^find_' -and $null -ne $chosen){$chosen|ConvertTo-Json -Compress;exit}
  throw ('Could not uniquely locate '+$query+' in Windows search.')
 }
 if($r.action -eq 'launch_obs'){
  $paths=@("$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe","${env:ProgramFiles(x86)}\obs-studio\bin\64bit\obs64.exe")
  if(!(Get-Process obs64 -ErrorAction SilentlyContinue)){$exe=$paths|Where-Object {Test-Path -LiteralPath $_}|Select-Object -First 1;if(!$exe){throw 'OBS installation not found.'};Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Normal|Out-Null}
  @{launched='OBS'}|ConvertTo-Json -Compress;exit
 }
 if($r.action -eq 'launch_game'){
  $apps=@(Get-StartApps|Where-Object {$_.Name -match '^Asphalt.*Legends'});if($apps.Count -ne 1){throw 'Choose a unique Asphalt Legends installation in Windows before continuing.'}
  if($apps[0].AppID -notmatch '^[\w.\-]+![\w.\-]+$'){throw 'This Asphalt launcher is not supported yet. Open the game manually, then retry.'}
  Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\'+$apps[0].AppID) -WindowStyle Hidden|Out-Null
  @{launched='Asphalt Legends'}|ConvertTo-Json -Compress;exit
 }
 $roots=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,[Windows.Automation.Condition]::TrueCondition)
 $appWindows=@();foreach($root in $roots){try{$proc=Get-Process -Id $root.Current.ProcessId -ErrorAction Stop;$name=$proc.ProcessName;$title=$root.Current.Name
  if(($r.app -eq 'obs' -and $name -eq 'obs64') -or ($r.app -eq 'game' -and $name -match '^Asphalt') -or ($r.app -eq 'scenesense' -and $name -eq 'electron' -and $title -eq 'SceneSense')){$appWindows+=$root}
 }catch{}}
 if(!$appWindows.Count){throw 'Target application window is not open.'}
 if($r.action -eq 'locate'){[SetupWindow]::SetForegroundWindow([IntPtr]$appWindows[0].Current.NativeWindowHandle)|Out-Null;Start-Sleep -Milliseconds 150}
 $nodes=@();foreach($root in $appWindows){$nodes+=$root;$all=$root.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition);foreach($node in $all){$nodes+=$node}}
 if($r.action -eq 'inspect'){
  $result=@();foreach($node in $nodes){try{$c=$node.Current;if(!$c.IsOffscreen -and !$c.IsPassword){$patterns=@($node.GetSupportedPatterns()|ForEach-Object {$_.ProgrammaticName});$result+=@{id=($node.GetRuntimeId()-join '.');name=$c.Name;type=$c.ControlType.ProgrammaticName;enabled=$c.IsEnabled;patterns=$patterns}}}catch{};if($result.Count -ge 500){break}}
  @{app=$r.app;controls=$result}|ConvertTo-Json -Depth 7 -Compress;exit
 }
 if($r.action -eq 'locate' -and $r.value){$named=@($nodes|Where-Object {!$_.Current.IsOffscreen -and $_.Current.Name -eq $r.value});if($named.Count -ne 1){throw 'Named control is not uniquely visible.'};$r|Add-Member -NotePropertyName control -NotePropertyValue ($named[0].GetRuntimeId()-join '.') -Force}
 if($r.action -eq 'locate' -and !$r.control){VisibleRect $appWindows[0] $true|ConvertTo-Json -Compress;exit}
 $target=@($nodes|Where-Object {($_.GetRuntimeId()-join '.') -eq $r.control});if($target.Count -ne 1){throw 'Control changed. Inspect the application again.'};$target=$target[0];$c=$target.Current
 if($c.IsPassword -or !$c.IsEnabled -or $c.IsOffscreen){throw 'Target is protected, disabled or hidden.'}
 if($r.action -eq 'locate'){VisibleRect $target|ConvertTo-Json -Compress;exit}
 if($c.Name -match '(?i)stream|broadcast|record|delete|remove|purchase|buy|sign.in|password|credential|exit|close|quit'){throw 'This control is outside the stream preparation scope.'}
 if($r.action -eq 'set_text'){$pattern=$target.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern);if($pattern.Current.IsReadOnly){throw 'Control is read-only.'};$pattern.SetValue([string]$r.value)}
 elseif($r.action -eq 'activate'){$pattern=$null
  if($target.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern,[ref]$pattern)){$pattern.Select()}
  elseif($target.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$pattern.Invoke()}
  elseif($target.TryGetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern,[ref]$pattern)){$pattern.Expand()}
  elseif($target.TryGetCurrentPattern([Windows.Automation.TogglePattern]::Pattern,[ref]$pattern)){$pattern.Toggle()}
  else{throw 'This control does not expose a supported accessibility action.'}
 }else{throw 'Unsupported desktop action.'}
 @{applied=$r.action;control=$r.control}|ConvertTo-Json -Compress
}catch{@{error=$_.Exception.Message}|ConvertTo-Json -Compress;exit 1}
