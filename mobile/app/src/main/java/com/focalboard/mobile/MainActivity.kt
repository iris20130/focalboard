package com.focalboard.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import java.net.URL
import kotlin.math.abs

class MainActivity : Activity() {

    companion object {
        const val PREFS = "focalboard_mobile"
        const val KEY_SERVER = "server_url"
        const val KEY_TAB_ORDER = "tab_order"
        const val LONG_PRESS_MS = 3000L
        const val TAB_BOARD = 0
        const val TAB_CALENDAR = 1
        const val TAB_PANEL = 2
        const val SEEK_MAX = 1000
    }

    private lateinit var root: FrameLayout
    private lateinit var webViewHost: FrameLayout
    private lateinit var bottomBar: LinearLayout
    private lateinit var dragHint: TextView
    private lateinit var boardScroller: LinearLayout
    private lateinit var boardSeek: SeekBar

    private val webViews = mutableListOf<WebView>()
    private var tabOrder = mutableListOf(TAB_BOARD, TAB_CALENDAR, TAB_PANEL)
    private var currentTab = TAB_BOARD
    private var serverUrl = ""

    private var dragMode = false
    private var draggingIndex = -1
    private var dragStartX = 0f
    private val handler = Handler(Looper.getMainLooper())
    private var longPressRunnable: Runnable? = null

    private var bottomBarHeight = 0
    private var scrollerHeight = 0
    private var scrollerShown = false
    private var metricsBusy = false
    private var lastSeekTouch = 0L
    private var pendingLocateCard: String? = null
    private val loggedIn = arrayOfNulls<Boolean>(3)
    private val reloadTries = IntArray(3)

    private val metricsRunnable = object : Runnable {
        override fun run() {
            if (currentTab != TAB_BOARD) return
            syncBoardMetrics()
            handler.postDelayed(this, 450)
        }
    }

    private val injectionJs = InjectionJs()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        tabOrder = prefs.getString(KEY_TAB_ORDER, "0,1,2")?.split(",")?.mapNotNull { it.toIntOrNull() }?.toMutableList()
            ?: mutableListOf(TAB_BOARD, TAB_CALENDAR, TAB_PANEL)
        if (tabOrder.size != 3 || tabOrder.toSet().size != 3) tabOrder = mutableListOf(TAB_BOARD, TAB_CALENDAR, TAB_PANEL)

        val server = prefs.getString(KEY_SERVER, null)
        root = FrameLayout(this)
        setContentView(root)

        if (server.isNullOrBlank()) {
            showSetupView()
        } else {
            showWebViews(server)
        }
    }

    // ---------- 首次启动：服务器地址 ----------

    private fun showSetupView() {
        val setup = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(64, 64, 64, 64)
        }
        val title = TextView(this).apply {
            text = getString(R.string.server_address_title)
            textSize = 20f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 48)
        }
        val input = EditText(this).apply {
            hint = getString(R.string.server_address_hint)
            setSingleLine(true)
        }
        val button = Button(this).apply {
            text = getString(R.string.server_address_connect)
            setOnClickListener {
                var url = input.text.toString().trim()
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    url = "http://$url"
                }
                if (!url.endsWith("/")) url += "/"
                if (isValidUrl(url)) {
                    getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit().putString(KEY_SERVER, url).apply()
                    root.removeAllViews()
                    showWebViews(url)
                } else {
                    Toast.makeText(this@MainActivity, R.string.server_address_invalid, Toast.LENGTH_LONG).show()
                }
            }
        }
        setup.addView(title)
        setup.addView(input)
        setup.addView(button)
        root.addView(
            setup,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        )
    }

    private fun isValidUrl(url: String): Boolean {
        return try {
            val u = URL(url)
            (u.protocol == "http" || u.protocol == "https") && u.host.isNotBlank()
        } catch (e: Exception) {
            false
        }
    }

    // ---------- 宿主 WebView 与 JS 桥 ----------

    private inner class Bridge(private val tabId: Int) {
        @JavascriptInterface
        fun reportState(logged: Boolean) {
            handler.post { onStateReported(tabId, logged) }
        }

        @JavascriptInterface
        fun openCard(url: String?, cardId: String?) {
            handler.post { onOpenCardRequested(url, cardId) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun showWebViews(server: String) {
        serverUrl = server
        webViewHost = FrameLayout(this)
        root.addView(
            webViewHost,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        )

        CookieManager.getInstance().setAcceptCookie(true)

        for (i in 0 until 3) {
            val wv = WebView(this).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.databaseEnabled = true
                settings.cacheMode = WebSettings.LOAD_DEFAULT
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                settings.userAgentString = settings.userAgentString + " FocalboardMobile/1.1.0"
                webChromeClient = WebChromeClient()
                setBackgroundColor(Color.WHITE)
            }
            wv.addJavascriptInterface(Bridge(i), "FocalboardAndroid")
            attachClient(wv, i)
            webViews.add(wv)
            webViewHost.addView(wv, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
        webViews.forEach { it.loadUrl(server) }

        buildBottomBar()
        buildBoardScroller()
        showTab(TAB_BOARD)
    }

    private fun attachClient(wv: WebView, tabId: Int) {
        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = false

            override fun onPageFinished(view: WebView, url: String) {
                applyInjection(tabId, view)
                if (tabId == TAB_BOARD) {
                    dispatchPendingLocate(view)
                    handler.postDelayed({ if (currentTab == TAB_BOARD) syncBoardMetrics() }, 600)
                }
            }
        }
    }

    private fun applyInjection(tabId: Int, webView: WebView) {
        val js = when (tabId) {
            TAB_BOARD -> injectionJs.boardJs()
            TAB_CALENDAR -> injectionJs.calendarJs()
            else -> injectionJs.panelJs()
        }
        webView.evaluateJavascript(js, null)
    }

    // ---------- 三页登录态同步 ----------

    private fun onStateReported(tabId: Int, logged: Boolean) {
        loggedIn[tabId] = logged
        if (!logged) return
        for (i in 0 until 3) {
            if (i == tabId) continue
            if (loggedIn[i] == false && reloadTries[i] < 2) {
                reloadTries[i]++
                loggedIn[i] = null
                webViews[i].reload()
            }
        }
    }

    // ---------- 逾期设置页点卡片 → 看板页定位 ----------

    private fun onOpenCardRequested(url: String?, cardId: String?) {
        if (url.isNullOrBlank() || cardId.isNullOrBlank()) return
        if (!url.startsWith(serverUrl)) return
        if (!cardId.matches(Regex("[A-Za-z0-9_-]+"))) return
        val boardWv = webViews[TAB_BOARD]
        pendingLocateCard = cardId
        if (boardWv.url != url) {
            boardWv.loadUrl(url)
        } else {
            pendingLocateCard = null
            dispatchLocate(boardWv, cardId, 400)
        }
        showTab(TAB_BOARD)
    }

    private fun dispatchPendingLocate(view: WebView) {
        val cardId = pendingLocateCard ?: return
        if (!cardId.matches(Regex("[A-Za-z0-9_-]+"))) {
            pendingLocateCard = null
            return
        }
        pendingLocateCard = null
        dispatchLocate(view, cardId, 700)
        dispatchLocate(view, cardId, 2000)
    }

    private fun dispatchLocate(view: WebView, cardId: String, delayMs: Long) {
        val js = "(function(){try{window.dispatchEvent(new CustomEvent('focalboard:locate-card',{detail:{cardId:'$cardId'}}));}catch(e){}})()"
        handler.postDelayed({ view.evaluateJavascript(js, null) }, delayMs)
    }

    // ---------- 底栏 ----------

    private fun buildBottomBar() {
        if (::bottomBar.isInitialized) root.removeView(bottomBar)
        bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.WHITE)
            elevation = 16f
        }
        val labels = intArrayOf(R.string.tab_board, R.string.tab_calendar, R.string.tab_panel)
        val icons = intArrayOf(R.drawable.ic_tab_board, R.drawable.ic_tab_calendar, R.drawable.ic_tab_panel)

        tabOrder.forEachIndexed { index, tabId ->
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                tag = tabId
                setOnTouchListener(createDragTouchListener(index))
            }
            val icon = ImageView(this).apply {
                setImageResource(icons[tabId])
                val s = (26 * resources.displayMetrics.density).toInt()
                layoutParams = LinearLayout.LayoutParams(s, s)
            }
            val label = TextView(this).apply {
                text = getString(labels[tabId])
                textSize = 11f
                gravity = Gravity.CENTER
            }
            item.addView(icon)
            item.addView(label)
            bottomBar.addView(item, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
        }

        bottomBarHeight = (58 * resources.displayMetrics.density).toInt()
        root.addView(
            bottomBar,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, bottomBarHeight, Gravity.BOTTOM)
        )
        applyWebViewPadding()
        updateTabHighlight()

        dragHint = TextView(this).apply {
            text = getString(R.string.drag_hint)
            setBackgroundColor(0xCC3D5AFE.toInt())
            setTextColor(Color.WHITE)
            textSize = 13f
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        root.addView(
            dragHint,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, (32 * resources.displayMetrics.density).toInt(), Gravity.TOP)
        )
    }

    // ---------- 第 1 页：原生横向拖动栏 ----------

    private fun buildBoardScroller() {
        scrollerHeight = (34 * resources.displayMetrics.density).toInt()
        boardScroller = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(0xF2FFFFFF.toInt())
            elevation = 8f
            setPadding(dp(2), 0, dp(2), 0)
            visibility = View.GONE
        }
        val prev = TextView(this).apply {
            text = "‹"
            textSize = 24f
            setTextColor(0xFF3D5AFE.toInt())
            gravity = Gravity.CENTER
            setPadding(dp(10), 0, dp(6), 0)
            contentDescription = getString(R.string.board_scroller_prev)
            setOnClickListener { nudgeBoard(-1) }
        }
        val next = TextView(this).apply {
            text = "›"
            textSize = 24f
            setTextColor(0xFF3D5AFE.toInt())
            gravity = Gravity.CENTER
            setPadding(dp(6), 0, dp(10), 0)
            contentDescription = getString(R.string.board_scroller_next)
            setOnClickListener { nudgeBoard(1) }
        }
        boardSeek = SeekBar(this).apply {
            max = SEEK_MAX
            splitTrack = false
            progressTintList = ColorStateList.valueOf(0xFF3D5AFE.toInt())
            progressBackgroundTintList = ColorStateList.valueOf(0xFFD9D9D9.toInt())
            thumbTintList = ColorStateList.valueOf(0xFF3D5AFE.toInt())
            setPadding(dp(6), 0, dp(6), 0)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                    if (!fromUser) return
                    lastSeekTouch = System.currentTimeMillis()
                    scrollBoardTo(progress)
                }

                override fun onStartTrackingTouch(seekBar: SeekBar?) {
                    lastSeekTouch = System.currentTimeMillis()
                }

                override fun onStopTrackingTouch(seekBar: SeekBar?) {
                    lastSeekTouch = System.currentTimeMillis()
                    syncBoardMetrics()
                }
            })
        }
        boardScroller.addView(prev, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
        boardScroller.addView(boardSeek, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
        boardScroller.addView(next, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
        root.addView(
            boardScroller,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                scrollerHeight,
                Gravity.BOTTOM
            ).apply {
                bottomMargin = bottomBarHeight + dp(4)
                leftMargin = dp(8)
                rightMargin = dp(8)
            }
        )
    }

    private fun scrollBoardTo(progress: Int) {
        val p = progress.toDouble() / SEEK_MAX
        val js = "(function(p){var k=document.querySelector('.Kanban');if(!k)return;var m=k.scrollWidth-k.clientWidth;if(m<=0)return;k.scrollLeft=p*m;})($p)"
        webViews[TAB_BOARD].evaluateJavascript(js, null)
    }

    private fun nudgeBoard(direction: Int) {
        val js = "(function(d){var k=document.querySelector('.Kanban');if(!k)return;k.scrollBy({left:d*k.clientWidth*0.8,behavior:'smooth'});})($direction)"
        webViews[TAB_BOARD].evaluateJavascript(js, null)
        lastSeekTouch = System.currentTimeMillis()
        handler.postDelayed({ syncBoardMetrics() }, 500)
    }

    private fun syncBoardMetrics() {
        if (metricsBusy) return
        metricsBusy = true
        val js = "(function(){var k=document.querySelector('.Kanban');if(!k)return '';" +
            "return [Math.round(k.scrollLeft),Math.round(k.scrollWidth),Math.round(k.clientWidth)].join(',');})()"
        webViews[TAB_BOARD].evaluateJavascript(js) { raw ->
            metricsBusy = false
            val text = raw?.trim()?.trim('"') ?: ""
            val parts = text.split(",")
            if (parts.size < 3) {
                setScrollerVisible(false)
                return@evaluateJavascript
            }
            val left = parts[0].toDoubleOrNull()
            val scrollWidth = parts[1].toDoubleOrNull()
            val clientWidth = parts[2].toDoubleOrNull()
            if (left == null || scrollWidth == null || clientWidth == null) {
                setScrollerVisible(false)
                return@evaluateJavascript
            }
            val range = scrollWidth - clientWidth
            val scrollable = range > 8
            setScrollerVisible(scrollable)
            if (scrollable && System.currentTimeMillis() - lastSeekTouch > 700) {
                val p = ((left / range) * SEEK_MAX).toInt().coerceIn(0, SEEK_MAX)
                if (abs(boardSeek.progress - p) > 3) boardSeek.progress = p
            }
        }
    }

    private fun setScrollerVisible(show: Boolean) {
        if (scrollerShown == show) return
        scrollerShown = show
        boardScroller.visibility = if (show && currentTab == TAB_BOARD) View.VISIBLE else View.GONE
        applyWebViewPadding()
    }

    private fun applyWebViewPadding() {
        if (!::webViewHost.isInitialized) return
        val extra = if (currentTab == TAB_BOARD && scrollerShown) scrollerHeight + dp(6) else 0
        webViewHost.setPadding(0, 0, 0, bottomBarHeight + extra)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    // ---------- 页签与高亮 ----------

    private fun updateTabHighlight() {
        for (i in 0 until bottomBar.childCount) {
            val item = bottomBar.getChildAt(i) as LinearLayout
            val tabId = item.tag as Int
            val active = tabId == currentTab || dragMode
            (item.getChildAt(0) as ImageView).setColorFilter(if (active) 0xFF3D5AFE.toInt() else 0xFF8A8A8A.toInt())
            (item.getChildAt(1) as TextView).setTextColor(if (active) 0xFF3D5AFE.toInt() else 0xFF8A8A8A.toInt())
        }
    }

    private fun showTab(tabId: Int) {
        currentTab = tabId
        for (i in 0 until 3) {
            webViews[i].visibility = if (i == tabId) View.VISIBLE else View.INVISIBLE
        }
        applyInjection(tabId, webViews[tabId])
        boardScroller.visibility = if (tabId == TAB_BOARD && scrollerShown) View.VISIBLE else View.GONE
        applyWebViewPadding()
        updateTabHighlight()

        handler.removeCallbacks(metricsRunnable)
        if (tabId == TAB_BOARD) {
            handler.postDelayed(metricsRunnable, 350)
        }
    }

    // ---------- 底栏：长按 3 秒进入拖拽，横向拖动换位 ----------

    private fun createDragTouchListener(index: Int): View.OnTouchListener {
        return View.OnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    dragStartX = event.rawX
                    draggingIndex = index
                    val v = view
                    cancelLongPress()
                    longPressRunnable = Runnable {
                        dragMode = true
                        v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                        dragHint.visibility = View.VISIBLE
                        updateTabHighlight()
                    }
                    handler.postDelayed(longPressRunnable!!, LONG_PRESS_MS)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val moved = Math.abs(event.rawX - dragStartX)
                    if (!dragMode && moved > 24 * resources.displayMetrics.density) {
                        cancelLongPress()
                    }
                    if (dragMode && draggingIndex == index) {
                        view.translationX = event.rawX - dragStartX
                        val w = bottomBar.width / 3f
                        val shift = Math.round(view.translationX / w)
                        val target = (index + shift).coerceIn(0, 2)
                        if (target != index) {
                            swapItems(index, target)
                            draggingIndex = target
                            dragStartX = event.rawX
                            view.translationX = 0f
                        }
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (dragMode) {
                        dragMode = false
                        view.translationX = 0f
                        dragHint.visibility = View.GONE
                        updateTabHighlight()
                        draggingIndex = -1
                    } else {
                        cancelLongPress()
                        if (event.actionMasked == MotionEvent.ACTION_UP) {
                            val tabId = (view as LinearLayout).tag as Int
                            showTab(tabId)
                        }
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun cancelLongPress() {
        longPressRunnable?.let { handler.removeCallbacks(it) }
        longPressRunnable = null
    }

    private fun swapItems(from: Int, to: Int) {
        val a = bottomBar.getChildAt(from)
        bottomBar.removeView(a)
        bottomBar.addView(a, to)
        val tmp = tabOrder[from]
        tabOrder[from] = tabOrder[to]
        tabOrder[to] = tmp
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_TAB_ORDER, tabOrder.joinToString(",")).apply()
        updateTabHighlight()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
