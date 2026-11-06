@echo off
setlocal
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe

"%CSC%" -nologo -target:winexe -platform:x64 -optimize+ ^
  -out:runtime\FocalboardCalendar.exe -win32icon:focalboard.ico ^
  -r:runtime\Microsoft.Web.WebView2.Core.dll ^
  -r:runtime\Microsoft.Web.WebView2.WinForms.dll ^
  -r:System.dll -r:System.Core.dll -r:System.Drawing.dll ^
  -r:System.Windows.Forms.dll -r:System.Web.Extensions.dll ^
  FocalboardCalendar.cs

if errorlevel 1 (
  echo Build failed.
  exit /b 1
)
echo Built: runtime\FocalboardCalendar.exe
