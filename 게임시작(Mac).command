#!/bin/bash
# 진담중국어 테트리스 — Mac에서 항상 Chrome 앱 창으로 실행
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="file://${DIR// /%20}/index.html"
if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL" --window-size=1100,1000
else
  osascript -e 'display dialog "Google Chrome이 필요해요. 설치 페이지를 열게요." buttons {"확인"} default button 1'
  open "https://www.google.com/chrome/"
fi
