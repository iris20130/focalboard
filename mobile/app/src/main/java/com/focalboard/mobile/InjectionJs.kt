package com.focalboard.mobile

/**
 * 三个页面对同一网页做不同裁剪的注入脚本。
 * 不改动 Focalboard 源码，纯 CSS 隐藏无关区域 + 少量点击模拟。
 */
class InjectionJs {

    private fun base(): String = """
        (function(){
          if (!document.getElementById('fb-mobile-style')) {
            var s = document.createElement('style');
            s.id = 'fb-mobile-style';
            document.head.appendChild(s);
          }
        })();
    """.trimIndent()

    private fun encodeCss(css: String): String = css
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")

    /**
     * requireSelector 非空时，仅当该选择器存在且不在登录页才套样式；
     * 避免登录页被裁剪成空白。window.__fbApplyStyle 供后续看门狗重贴。
     */
    private fun styleFor(css: String, requireSelector: String = ""): String {
        val encoded = encodeCss(css)
        val guard = if (requireSelector.isBlank()) {
            "if (document.querySelector('.LoginPage')) return false;"
        } else {
            "if (!document.querySelector('$requireSelector')) return false;\n" +
                "                if (document.querySelector('.LoginPage')) return false;"
        }
        return """
            (function(){
              function allowed(){
                $guard
                return true;
              }
              function apply(){
                var el = document.getElementById('fb-mobile-style');
                if (!el) { setTimeout(apply, 300); return; }
                el.textContent = allowed() ? "$encoded" : "";
              }
              window.__fbApplyStyle = apply;
              apply();
              setTimeout(apply, 800);
              setTimeout(apply, 2000);
            })();
        """.trimIndent()
    }

    /** 向原生外壳回报登录态，供三页同步登录使用。 */
    private fun bridgeState(): String = """
        (function(){
          if (window.__fbStateTimer) return;
          function report(){
            try {
              var ok = !!document.querySelector('.DueLayout') && !document.querySelector('.LoginPage');
              FocalboardAndroid.reportState(ok);
            } catch (e) {}
          }
          report();
          window.__fbStateTimer = setInterval(report, 4000);
        })();
    """.trimIndent()

    // Tab1 看板：隐藏左栏与右栏，看板满屏
    fun boardJs(): String {
        val css = """
          .Sidebar, .Sidebar.octo-sidebar, .Sidebar.hidden { display: none !important; }
          .DueSidebar { display: none !important; }
          .DueLayout__divider { display: none !important; }
          .DueTopBar__toggle { display: none !important; }
          .DueTopBar__placeholder { display: none !important; }
          .DueTopBar { height: 0 !important; min-height: 0 !important; border: none; padding: 0; overflow: hidden; }
        """.trimIndent()
        return base() + styleFor(css) + bridgeState()
    }

    // Tab2 日历：把假勤日历弹窗整页化，默认展开流水
    fun calendarJs(): String {
        val css = """
          html, body { overflow: hidden !important; }
          body { margin: 0 !important; }
          .Sidebar, .Sidebar.octo-sidebar, .Sidebar.hidden { display: none !important; }
          .Workspace > .mainFrame > *:not(.DueLayout) { display: none !important; }
          .DueLayout__content { display: none !important; }
          .DueLayout__divider { display: none !important; }
          .DueSidebar { display: none !important; }
          .DueTopBar { height: 0 !important; min-height: 0 !important; border: none !important; padding: 0 !important; overflow: hidden !important; }
          .DueTopBar__toggle, .DueTopBar__placeholder { display: none !important; }
          .LeaveCalendar.fb-mobile-leave {
              position: fixed !important;
              left: 0 !important; top: 0 !important; right: 0 !important; bottom: 0 !important;
              width: 100vw !important; max-width: none !important;
              height: 100vh !important; max-height: none !important;
              transform: none !important;
              border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
              overflow-y: auto !important; overflow-x: hidden !important;
              z-index: 6000 !important;
              padding: 10px 10px 28px !important;
              font-size: 13px !important;
          }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__header {
              position: sticky !important; top: 0 !important;
              background: rgb(var(--center-channel-bg-rgb)) !important;
              z-index: 4 !important; padding-bottom: 4px !important;
          }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__header button { padding: 8px 10px !important; font-size: 16px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__title { font-size: 16px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__close { display: none !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__balances { flex-wrap: wrap !important; gap: 6px 12px !important; font-size: 12px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__cell { min-height: 54px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__num { font-size: 14px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__lunar { font-size: 10px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__tabs button { padding: 9px 0 !important; font-size: 14px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__panel {
              max-height: none !important; overflow: visible !important;
              font-size: 13px !important; padding: 10px !important;
          }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__panel .row { gap: 8px !important; margin-bottom: 8px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__panel input[type=date],
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__panel input[type=text],
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__panel input[type=number],
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__panel select { font-size: 14px !important; padding: 4px 6px !important; }
          .LeaveCalendar.fb-mobile-leave .LeaveCalendar__ledger .row { font-size: 13px !important; padding: 4px 0 !important; }
        """.trimIndent()
        val js = """
            (function(){
              function tick(){
                try { if (window.__fbApplyStyle) window.__fbApplyStyle(); } catch (e) {}
                if (!document.querySelector('.DueLayout') || document.querySelector('.LoginPage')) return;
                var cal = document.querySelector('.LeaveCalendar');
                if (cal) {
                  if (!cal.classList.contains('fb-mobile-leave')) cal.classList.add('fb-mobile-leave');
                  var tabs = cal.querySelectorAll('.LeaveCalendar__tabs button');
                  for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].textContent.trim() === '流水') {
                      if (!tabs[i].classList.contains('active')) tabs[i].click();
                      break;
                    }
                  }
                  return;
                }
                var strip = document.querySelector('.DueTopBar__calendar');
                if (strip) strip.click();
              }
              if (!window.__fbCalTimer) window.__fbCalTimer = setInterval(tick, 1200);
              tick();
            })();
        """.trimIndent()
        return base() + styleFor(css, ".DueLayout") + js + bridgeState()
    }

    // Tab3 逾期设置：整页右栏，自动展开齿轮设置，放大触控区域
    fun panelJs(): String {
        val css = """
          body { overflow: hidden !important; }
          .Sidebar, .Sidebar.octo-sidebar, .Sidebar.hidden { display: none !important; }
          .Workspace > .mainFrame > *:not(.DueLayout) { display: none !important; }
          .DueLayout__content { display: none !important; }
          .DueLayout__divider { display: none !important; }
          .DueTopBar { height: 0 !important; min-height: 0 !important; border: none !important; padding: 0 !important; overflow: hidden !important; }
          .DueTopBar__toggle, .DueTopBar__placeholder { display: none !important; }
          .DueSidebar {
              width: 100% !important; max-width: 100% !important; min-width: 0 !important;
              border: none !important; height: 100vh !important;
              position: fixed; inset: 0; z-index: 5000;
          }
          .DueSidebar__header { position: sticky; top: 0; background: rgb(var(--center-channel-bg-rgb)); z-index: 2; padding: 8px 8px 4px !important; }
          .DueSidebar__body { padding: 4px 10px 24px !important; }
          .DueSidebar__boardRow { padding: 13px 10px !important; }
          .DueSidebar__boardTitle { font-size: 16px !important; }
          .DueSidebar__boardCount { font-size: 14px !important; }
          .DueSidebar__chevron svg { width: 20px; height: 20px; }
          .DueSidebar__item { padding: 11px 10px !important; }
          .DueSidebar__itemTitle { font-size: 15px !important; }
          .DueSidebar__itemDue { font-size: 13px !important; }
          .DueSidebar__gear { padding: 8px !important; font-size: 20px !important; }
          .DueSidebar__gear svg { width: 22px; height: 22px; }
          .DueSidebar__settingRow label, .DueSidebar__settingColumn label { font-size: 13px !important; }
          .DueSidebar__settings input, .DueSidebar__settings select { font-size: 15px !important; }
          .DueSidebar__toggle { padding: 6px 10px !important; }
          .DueSidebar__toggleLabel { font-size: 12px !important; }
        """.trimIndent()
        val js = """
            (function(){
              function ensureSidebar(){
                if (document.querySelector('.DueSidebar')) return true;
                var toggle = document.querySelector('.DueTopBar__toggle');
                if (toggle && !toggle.classList.contains('active')) {
                  var old = null;
                  try { old = localStorage.getItem('focalboard.duePanel.open'); } catch (e) {}
                  toggle.click();
                  // 还原电脑端共用的开关偏好，避免手机上打开栏位影响桌面端
                  try {
                    if (old === null) localStorage.removeItem('focalboard.duePanel.open');
                    else localStorage.setItem('focalboard.duePanel.open', old);
                  } catch (e) {}
                }
                return false;
              }
              function openSettings(){
                if (!ensureSidebar()) { setTimeout(openSettings, 500); return; }
                var gear = document.querySelector('.DueSidebar__gear');
                if (!gear) { setTimeout(openSettings, 600); return; }
                if (!gear.classList.contains('active')) gear.click();
              }
              function tick(){
                try { if (window.__fbApplyStyle) window.__fbApplyStyle(); } catch (e) {}
                if (!document.querySelector('.DueLayout') || document.querySelector('.LoginPage')) return;
                ensureSidebar();
              }
              if (!window.__fbPanelTimer) window.__fbPanelTimer = setInterval(tick, 1200);
              if (!window.__fbGearTimer) window.__fbGearTimer = setTimeout(openSettings, 1500);
              if (!window.__fbCardHook) {
                window.__fbCardHook = true;
                window.addEventListener('focalboard:locate-card', function(e){
                  var cardId = e && e.detail && e.detail.cardId;
                  if (!cardId) return;
                  try { FocalboardAndroid.openCard(location.href, cardId); } catch (err) {}
                  setTimeout(function(){ try { history.back(); } catch (err) {} }, 250);
                }, true);
              }
            })();
        """.trimIndent()
        return base() + styleFor(css, ".DueLayout") + js + bridgeState()
    }
}
