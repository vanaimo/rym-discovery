Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = currentDir & "\run_auto.bat"

' Il parametro 0 esegue il file completamente nascosto, senza alcuna finestra visibile
WshShell.Run "cmd.exe /c """ & batPath & """", 0, False
