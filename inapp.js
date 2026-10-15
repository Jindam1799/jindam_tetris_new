/*! 词块 HSK4 · 단어블록 테트리스 | © 2026 진담중국어. All rights reserved. 무단 복제·배포 금지 */
/* =========================================================
   인앱 브라우저 탈출 — 카카오톡·네이버·인스타그램 등에서
   링크를 누르면 Chrome에서 새로 열리게 합니다.
   (index.html <head> 맨 위에서 가장 먼저 실행)
   ========================================================= */
(function () {
  'use strict';
  if (!/^https?:$/.test(location.protocol)) return; // 내 컴퓨터 파일(file://)로 열 때는 해당 없음

  var ua = navigator.userAgent || '';
  var IN_APP = /KAKAOTALK|NAVER\(inapp|; ?wv\)|Line\/|Instagram|FBAN|FBAV|FB_IAB|DaumApps|everytimeApp|BAND\/|SamsungBrowser\/[^ ]+ CrossApp/i;
  if (!IN_APP.test(ua)) return;

  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isKakao = /KAKAOTALK/i.test(ua);
  var url = location.href;
  var noScheme = url.replace(/^https?:\/\//, '');
  var scheme = location.protocol.replace(':', '');

  function go(target) {
    window.__inappTarget = target; // 테스트 확인용
    if (window.__inappDryRun) return;
    location.href = target;
  }

  var fallbackTimer = null;
  document.addEventListener('visibilitychange', function () {
    // Chrome이 열려서 이 창이 뒤로 가면 예비 동작 취소
    if (document.hidden && fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  });

  function openChrome() {
    if (isAndroid) {
      // 안드로이드: Chrome 앱을 지정해서 열기 (Chrome이 없으면 Play 스토어로 안내됨)
      go('intent://' + noScheme + '#Intent;scheme=' + scheme + ';package=com.android.chrome;end');
    } else if (isIOS) {
      // 아이폰: Chrome 앱으로 열기 → 안 열리면(Chrome 미설치) 카카오톡은 Safari로 열기
      go(url.replace(/^https:/, 'googlechromes:').replace(/^http:/, 'googlechrome:'));
      if (isKakao) {
        fallbackTimer = setTimeout(function () {
          go('kakaotalk://web/openExternal?url=' + encodeURIComponent(url));
        }, 1500);
      }
    } else if (isKakao) {
      // PC 카카오톡 내부 브라우저: 기본 브라우저로 열기
      go('kakaotalk://web/openExternal?url=' + encodeURIComponent(url));
    }
  }

  // 자동으로 한 번 시도
  openChrome();

  // 혹시 자동으로 안 넘어갔을 때를 위한 안내 화면
  function showGuide() {
    if (document.getElementById('inapp-guide')) return;
    var box = document.createElement('div');
    box.id = 'inapp-guide';
    box.setAttribute(
      'style',
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;' +
        'background:linear-gradient(180deg,#7ccbff,#e9f8ff);color:#2b2a4c;' +
        "font-family:'Jua','Apple SD Gothic Neo','Malgun Gothic',sans-serif;text-align:center;",
    );
    var menuHint = isIOS
      ? '오른쪽 아래 <b>⋯</b> 또는 <b>공유</b> 버튼 → <b>다른 브라우저로 열기</b>'
      : '오른쪽 위 <b>⋮</b> 메뉴 → <b>다른 브라우저로 열기</b>';
    box.innerHTML =
      '<div style="max-width:360px">' +
      '<img src="icon/icon-192.png" alt="" style="width:100px;height:100px;border-radius:26px;border:4px solid #2b2a4c;box-shadow:0 6px 0 #2b2a4c">' +
      '<h2 style="margin:18px 0 8px;font-size:22px">Chrome에서 열어 주세요</h2>' +
      '<p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#4b4870">카카오톡 안에서는 소리와 중국어 음성이 제대로 나오지 않아요.<br>Chrome이 열렸다면 이 창은 닫아도 돼요.</p>' +
      '<button id="inapp-open" style="display:block;width:100%;padding:15px;border:none;border-radius:14px;font-size:17px;font-weight:900;color:#2b2a4c;background:#ffd23f;border:3px solid #2b2a4c;box-shadow:0 5px 0 #2b2a4c">Chrome으로 열기</button>' +
      '<button id="inapp-copy" style="display:block;width:100%;margin-top:12px;padding:13px;border-radius:14px;font-size:15px;font-weight:700;color:#2b2a4c;background:#fff;border:3px solid #2b2a4c;box-shadow:0 4px 0 #2b2a4c">링크 복사하기</button>' +
      '<p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#4b4870">그래도 안 되면 ' + menuHint + '</p>' +
      '<button id="inapp-stay" style="margin-top:14px;background:none;border:none;color:#4b4870;font-size:13px;text-decoration:underline">그냥 여기서 할게요</button>' +
      '</div>';
    document.body.appendChild(box);
    document.getElementById('inapp-open').onclick = openChrome;
    document.getElementById('inapp-stay').onclick = function () {
      box.remove();
    };
    document.getElementById('inapp-copy').onclick = function () {
      var btn = this;
      function done() {
        btn.textContent = '복사됐어요! Chrome 주소창에 붙여 넣으세요';
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, legacy);
      } else legacy();
      function legacy() {
        var t = document.createElement('textarea');
        t.value = url;
        document.body.appendChild(t);
        t.select();
        try {
          document.execCommand('copy');
          done();
        } catch (e) {
          prompt('아래 링크를 길게 눌러 복사하세요', url);
        }
        t.remove();
      }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showGuide);
  else showGuide();
})();
