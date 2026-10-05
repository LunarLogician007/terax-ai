; "Open in TOSS Terminal" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInToss" "" "Open in TOSS Terminal"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInToss" "Icon" '"$INSTDIR\toss.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInToss" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInToss\command" "" '"$INSTDIR\toss.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInToss" "" "Open in TOSS Terminal"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInToss" "Icon" '"$INSTDIR\toss.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInToss" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInToss\command" "" '"$INSTDIR\toss.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInToss" "" "Open in TOSS Terminal"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInToss" "Icon" '"$INSTDIR\toss.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInToss" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInToss\command" "" '"$INSTDIR\toss.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInToss"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInToss"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInToss"
!macroend
