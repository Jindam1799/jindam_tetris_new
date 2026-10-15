진담중국어 테트리스 — 실행 방법
================================

■ Windows
  1) 「바탕화면 바로가기 만들기(Windows).bat」을 한 번 더블클릭하세요.
     → 바탕화면에 아이콘이 생기고, 앞으로는 그 아이콘으로 항상 Chrome에서 열려요.
  2) 바로 해 보고 싶으면 「게임시작(Windows).bat」을 더블클릭해도 돼요.
  ※ "Windows의 PC 보호" 창이 뜨면 [추가 정보] → [실행]을 누르세요.

■ Mac
  「게임시작(Mac).command」를 더블클릭하세요.
  ※ 처음에 막히면 파일을 마우스 오른쪽 클릭 → [열기]를 누르세요.
  ※ Mac에서는 중국어 음성으로 Tingting이 자동으로 쓰여요.

■ 중국어 음성 (Tingting)
  - Tingting은 Mac·iPhone에 들어 있는 음성이에요.
  - Windows에는 Tingting이 없어서 「Google 普通话」(인터넷 필요) 또는
    Microsoft 중국어 여성 음성이 자동으로 쓰여요.
  - 게임 안 ⚙️ 설정에서 음성을 직접 고르고 테스트할 수 있어요.

■ 단어 추가
  data.js 파일의 VOCAB_LIST에 { kr: '뜻', cn: '中文', py: 'pīnyīn' } 형식으로 추가하면 돼요.

■ 폴더 구성
  index.html / style.css / script.js / data.js  ← 게임
  sound/  ← 배경음악 (효과음은 코드로 직접 만들어서 파일이 필요 없어요)
  icon/   ← 아이콘 (ico: Windows, icns: Mac, png: 웹)
