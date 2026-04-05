@echo off
chcp 65001 >nul
echo ========================================
echo  ESS ASSISTENT
echo ========================================

set OLLAMA_MODELS=C:\ollama_models
set OLLAMA_ORIGINS=*

REM Ollamaが起動していなければ起動する
tasklist /FI "IMAGENAME eq ollama.exe" 2>nul | find /I "ollama.exe" >nul
if errorlevel 1 (
    echo [起動中] Ollama を起動しています...
    if not exist "D:\brain\ollama_cpu\ollama.exe" (
        echo [エラー] ollama.exe が見つかりません: D:\brain\ollama_cpu\ollama.exe
        echo Ollamaを手動で起動してから index.html を開いてください。
        pause
        exit /b 1
    )
    start "" "D:\brain\ollama_cpu\ollama.exe" serve
    echo [待機中] 3秒待ちます...
    timeout /t 3 >nul
) else (
    echo [OK] Ollama はすでに起動しています。
    echo [注意] OLLAMA_ORIGINS=* が設定されているか確認してください。
)

echo [OK] ブラウザを開いています...
start "" "%~dp0index.html"
echo 完了。このウィンドウは閉じて構いません。
timeout /t 2 >nul
