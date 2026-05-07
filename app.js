(() => {
    const $ = id => document.getElementById(id);
    const pad = n => String(n).padStart(2, '0');
    const ease = p => 1 - (1 - p) * (1 - p);
    const clampEased = p => 1 - Math.pow(1 - p, 3);

    // ==================== NumberPicker ====================
    // Virtual scroll-wheel: 5 DOM items, center item (index 2) is selected.
    // shiftUp = value increase (array left shift), shiftDown = decrease (right shift).
    // step applies to click/keyboard only; drag/wheel always move by 1.

    class NumberPicker {
        constructor(container, scrollEl, opts = {}) {
            this.el = container;
            this.scroll = scrollEl;
            this.min = opts.min ?? 0;
            this.max = opts.max ?? 59;
            this.step = opts.step || 1;
            this.onChange = opts.onChange || null;
            this.value = opts.value ?? 0;
            this.itemH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--item-height'));
            this.count = 5;
            this.center = 2;
            this.containerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--window-height'));
            // Offset to center the middle item in the viewport
            this.baseOff = -(this.center * this.itemH - this.containerH / 2 + this.itemH / 2);
            this.items = [];
            this.vis = [];
            this.off = 0;
            this.vel = 0;
            this.dragging = false;
            this.mouseDown = false;
            this.y0 = 0;
            this.yLast = 0;
            this.tLast = 0;
            this.dist = 0;
            this.pending = 0;
            this.slop = 8;
            this.raf = null;
            this.friction = 0.95;
            this._init();
        }

        static _docBound = false;

        static _bindDoc() {
            if (NumberPicker._docBound) return;
            NumberPicker._docBound = true;
            let active = null;
            document.addEventListener('mousemove', e => { if (active?.mouseDown) active._moveDrag(e.clientY); });
            document.addEventListener('mouseup', () => { if (!active?.mouseDown) return; active.mouseDown = false; active._endDrag(); active = null; });
            NumberPicker._setActive = p => { active = p; };
        }

        _init() {
            NumberPicker._bindDoc();
            const frag = document.createDocumentFragment();
            for (let i = 0; i < this.count; i++) {
                const d = document.createElement('div');
                d.className = 'time-item';
                frag.appendChild(d);
                this.items.push(d);
            }
            this.scroll.appendChild(frag);
            this.set(this.value);
            this._bind();
        }

        wrap(v) {
            const r = this.max - this.min + 1;
            return v > this.max ? this.min + ((v - this.min) % r)
                 : v < this.min ? this.max - ((this.min - v - 1) % r)
                 : v;
        }

        _render() {
            for (let i = 0; i < this.count; i++)
                this.items[i].textContent = String(this.vis[i]).padStart(2, '0');
        }

        _pos() {
            this.scroll.style.transform = `translateY(${this.off + this.baseOff}px)`;
        }

        _hl() {
            const mid = this.containerH / 2;
            for (let i = 0; i < this.count; i++) {
                const d = Math.abs(this.off + this.baseOff + i * this.itemH + this.itemH / 2 - mid);
                const cl = this.items[i].classList;
                cl.remove('selected', 'near');
                if (d < this.itemH / 2) cl.add('selected');
                else if (d < this.itemH * 1.5) cl.add('near');
            }
        }

        _update() { this._pos(); this._render(); this._hl(); }

        _seed(cv) {
            for (let i = 0; i < this.count; i++) this.vis[i] = this.wrap(cv + i - this.center);
        }

        _sync() { this.value = this.vis[this.center]; }

        shiftUp() {
            for (let i = 0; i < this.count - 1; i++) this.vis[i] = this.vis[i + 1];
            this.vis[this.count - 1] = this.wrap(this.vis[this.count - 2] + 1);
            this._sync();
        }

        shiftDown() {
            for (let i = this.count - 1; i > 0; i--) this.vis[i] = this.vis[i - 1];
            this.vis[0] = this.wrap(this.vis[1] - 1);
            this._sync();
        }

        // Clamp offset and shift items when crossing item boundaries
        _clamp() {
            while (this.off >= this.itemH)  { this.shiftDown(); this.off -= this.itemH; }
            while (this.off <= -this.itemH) { this.shiftUp();   this.off += this.itemH; }
        }

        set(v) {
            this.value = this.wrap(v);
            this._seed(this.value);
            this.off = 0;
            this._update();
        }

        commit() {
            this.off = 0;
            this._update();
            if (this.onChange) this.onChange(this.value);
        }

        _anim(start, end, ms, easing, cb) {
            this.off = start; this._pos();
            const t0 = performance.now();
            const tick = () => {
                const p = Math.min((performance.now() - t0) / ms, 1);
                this.off = start + (end - start) * easing(p);
                this._pos();
                if (p < 1) {
                    this.raf = requestAnimationFrame(tick);
                } else if (cb) {
                    cb();
                }
            };
            if (this.raf) cancelAnimationFrame(this.raf);
            this.raf = requestAnimationFrame(tick);
        }

        bounce(dir) {
            this._anim(dir * this.itemH, 0, 200, ease);
        }

        _click(y) {
            const off = y - this.el.getBoundingClientRect().top - this.el.clientHeight / 2;
            if (Math.abs(off) < this.itemH / 2) return;
            const dir = off < 0 ? -1 : 1;
            for (let i = 0; i < this.step; i++) dir > 0 ? this.shiftUp() : this.shiftDown();
            this.commit();
            this.bounce(dir);
        }

        _startDrag(y) {
            this.y0 = this.yLast = y;
            this.tLast = performance.now();
            this.vel = this.dist = this.pending = 0;
            this.dragging = false;
            this.el.classList.add('dragging');
            if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
        }

        _moveDrag(y) {
            if (!this.dragging) {
                this.pending = y - this.y0;
                this.dist = Math.abs(this.pending);
                if (this.dist > this.slop) {
                    this.dragging = true;
                    this.yLast = y;
                    this.off += this.pending;
                    this._clamp(); this._update();
                }
                return;
            }
            const dy = y - this.yLast;
            this.yLast = y;
            const now = performance.now();
            if (now > this.tLast) this.vel = dy / (now - this.tLast);
            this.tLast = now;
            this.off += dy;
            this._clamp(); this._update();
        }

        _endDrag() {
            this.el.classList.remove('dragging');
            if (!this.dragging) { if (this.dist < 10) this._click(this.y0); return; }
            this.dragging = false;
            Math.abs(this.vel) > 0.3 ? this._inertia() : this._snap();
        }

        _inertia() {
            const tick = () => {
                this.vel *= this.friction;
                this.off += this.vel * 16;
                this._clamp(); this._update();
                Math.abs(this.vel) > 0.01
                    ? (this.raf = requestAnimationFrame(tick))
                    : this._snap();
            };
            this.raf = requestAnimationFrame(tick);
        }

        _snap() {
            const target = Math.round(this.off / this.itemH) * this.itemH;
            this._anim(this.off, target, 200, clampEased, () => {
                this._clamp();
                this.commit();
            });
        }

        _bind() {
            const el = this.el;
            el.addEventListener('touchstart', e => {
                e.preventDefault(); this._startDrag(e.touches[0].clientY);
            }, { passive: false });
            el.addEventListener('touchmove', e => {
                if (!this.dragging) { this._moveDrag(e.touches[0].clientY); return; }
                e.preventDefault(); this._moveDrag(e.touches[0].clientY);
            }, { passive: false });
            el.addEventListener('touchend', () => this._endDrag());

            el.addEventListener('mousedown', e => {
                e.preventDefault(); this.mouseDown = true; this._startDrag(e.clientY);
                NumberPicker._setActive(this);
            });

            el.addEventListener('wheel', e => {
                e.preventDefault();
                const dir = e.deltaY > 0 ? -1 : 1;
                dir > 0 ? this.shiftUp() : this.shiftDown();
                this.commit();
                this.bounce(dir);
            }, { passive: false });
        }
    }

    // ==================== Nav ====================

    let activeTab = 'alarm';
    const navBtns = document.querySelectorAll('.nav-btn');
    const titles = {
        alarm: $('titleAlarm'),
        timer: $('titleTimer'),
        stopwatch: $('titleSw'),
        clock: $('titleClock')
    };

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            if (target === activeTab) return;
            activeTab = target;
            navBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === target));
            Object.keys(titles).forEach(k => titles[k].classList.toggle('active', k === target));
            $('alarmMode').classList.toggle('active', target === 'alarm');
            $('timerMode').classList.toggle('active', target === 'timer');
            $('stopwatchMode').classList.toggle('active', target === 'stopwatch');
            $('clockMode').classList.toggle('active', target === 'clock');
        });
    });

    // ==================== Alarm ====================

    const statusEl = $('alarmStatus');
    const btnSet = $('btnSet'), btnCancel = $('btnCancel');
    let hour = new Date().getHours(), minute = new Date().getMinutes();
    let alarmTimer = null, alarmOn = false, alarmH = null, alarmM = null;

    const showNow = () => { const d = new Date(); $('globalTime').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); };

    const ahp = new NumberPicker($('aHourCol'), $('aHourWrap'), {
        min: 0, max: 23, value: hour, step: 1,
        onChange: v => { hour = v; if (alarmOn) showStatus(); }
    });
    const amp = new NumberPicker($('aMinCol'), $('aMinWrap'), {
        min: 0, max: 59, value: minute, step: 5,
        onChange: v => { minute = v; if (alarmOn) showStatus(); }
    });

    function setAlarm() {
        if (alarmOn) return;
        alarmH = hour; alarmM = minute; alarmOn = true;
        const now = new Date(), at = new Date(now);
        at.setHours(alarmH, alarmM, 0, 0);
        if (at <= now) at.setDate(at.getDate() + 1);
        clearTimeout(alarmTimer);
        alarmTimer = setTimeout(fireAlarm, at - now);
        btnSet.textContent = '已设置'; btnSet.classList.add('is-set');
        btnCancel.style.display = 'inline-block';
        statusEl.classList.add('active'); showStatus();
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    }

    function cancelAlarm() {
        clearTimeout(alarmTimer); alarmTimer = null; alarmOn = false;
        btnSet.textContent = '设置闹钟'; btnSet.classList.remove('is-set');
        btnCancel.style.display = 'none';
        statusEl.textContent = ''; statusEl.classList.remove('active');
    }

    function fireAlarm() {
        cancelAlarm();
        playBeep();
        const t = pad(alarmH) + ':' + pad(alarmM);
        if ('Notification' in window && Notification.permission === 'granted')
            new Notification('闹钟', { body: t + ' 时间到！' });
        setTimeout(() => alert('闹钟时间到了！\n' + t), 300);
    }

    function showStatus() {
        if (!alarmOn) return;
        const now = new Date(), at = new Date(now);
        at.setHours(alarmH, alarmM, 0, 0);
        if (at <= now) at.setDate(at.getDate() + 1);
        const leftMs = at - now;
        const leftMin = Math.floor(leftMs / 60000);
        const h = Math.floor(leftMin / 60), m = leftMin % 60;
        if (h > 0) {
            statusEl.textContent = `闹钟 ${pad(alarmH)}:${pad(alarmM)} · 还有 ${h}时${m}分`;
        } else if (m > 0) {
            statusEl.textContent = `闹钟 ${pad(alarmH)}:${pad(alarmM)} · 还有 ${m}分`;
        } else {
            statusEl.textContent = `闹钟 ${pad(alarmH)}:${pad(alarmM)} · 不到1分钟`;
        }
    }

    btnSet.onclick = setAlarm;
    btnCancel.onclick = cancelAlarm;

    // ==================== Countdown Timer ====================

    let tHours = 0, tMinutes = 0, tSeconds = 0;
    const cd = { interval: null, totalMs: 0, remainingMs: 0, isPaused: false, pauseStart: 0, pausedMs: 0, start: 0 };

    const thp = new NumberPicker($('tHourCol'), $('tHourWrap'), {
        min: 0, max: 23, value: 0, step: 1,
        onChange: v => tHours = v
    });
    const tmp = new NumberPicker($('tMinCol'), $('tMinWrap'), {
        min: 0, max: 59, value: 0, step: 5,
        onChange: v => tMinutes = v
    });
    const tsp = new NumberPicker($('tSecCol'), $('tSecWrap'), {
        min: 0, max: 59, value: 0, step: 5,
        onChange: v => tSeconds = v
    });

    function getTimerMs() { return ((tHours * 3600) + (tMinutes * 60) + tSeconds) * 1000; }

    function showTimerPicker() {
        $('timerPicker').style.display = 'flex';
        $('countdownMode').style.display = 'none';
    }

    function startCountdown() {
        const ms = getTimerMs();
        if (ms <= 0) { alert('请选择倒计时时间'); return; }
        $('timerPicker').style.display = 'none';
        $('countdownMode').style.display = 'flex';
        cd.totalMs = cd.remainingMs = ms;
        cd.isPaused = false; cd.pausedMs = 0;
        cd.start = Date.now();
        updateCdDisplay();
        updatePauseBtn(false);
        if (cd.interval) clearInterval(cd.interval);
        cd.interval = setInterval(() => {
            if (cd.isPaused) return;
            cd.remainingMs = Math.max(0, cd.totalMs - (Date.now() - cd.start - cd.pausedMs));
            updateCdDisplay();
            if (cd.remainingMs <= 0) completeCountdown();
        }, 100);
    }

    function togglePause() {
        if (cd.isPaused) {
            cd.isPaused = false;
            cd.pausedMs += Date.now() - cd.pauseStart;
        } else {
            cd.isPaused = true;
            cd.pauseStart = Date.now();
        }
        updatePauseBtn(cd.isPaused);
    }

    function stopCountdown() {
        if (cd.interval) { clearInterval(cd.interval); cd.interval = null; }
        cd.isPaused = false;
        showTimerPicker();
    }

    function completeCountdown() {
        if (cd.interval) { clearInterval(cd.interval); cd.interval = null; }
        playBeep();
        setTimeout(() => { alert('倒计时结束！'); showTimerPicker(); }, 500);
    }

    function updateCdDisplay() {
        const total = Math.ceil(cd.remainingMs / 1000);
        $('cdHour').textContent = pad(Math.floor(total / 3600));
        $('cdMinute').textContent = pad(Math.floor((total % 3600) / 60));
        $('cdSecond').textContent = pad(total % 60);
    }

    function updatePauseBtn(paused) {
        $('btnPause').classList.toggle('is-paused', paused);
        $('countdownTime').classList.toggle('paused', paused);
    }

    $('btnStart').onclick = startCountdown;
    $('btnTimerReset').onclick = () => { tHours = tMinutes = tSeconds = 0; thp.set(0); tmp.set(0); tsp.set(0); };
    $('btnPause').onclick = togglePause;
    $('btnStop').onclick = stopCountdown;

    // ==================== Stopwatch ====================

    const sw = { raf: null, start: 0, elapsed: 0, running: false, laps: [] };

    function swFormat(ms) {
        const totalCs = Math.floor(ms / 10);
        const cs = totalCs % 100;
        const totalSec = Math.floor(totalCs / 100);
        const s = totalSec % 60;
        const m = Math.floor(totalSec / 60);
        return pad(m) + ':' + pad(s) + '.' + pad(cs);
    }

    function swUpdate() {
        if (!sw.running) return;
        const ms = sw.elapsed + (performance.now() - sw.start);
        $('swDisplay').textContent = swFormat(ms);
        sw.raf = requestAnimationFrame(swUpdate);
    }

    function setSwBtnIcon(running) {
        const btn = $('btnSwStart');
        while (btn.firstChild) btn.removeChild(btn.firstChild);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'currentColor');
        if (running) {
            const r1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            r1.setAttribute('x','6'); r1.setAttribute('y','4'); r1.setAttribute('width','4'); r1.setAttribute('height','16'); r1.setAttribute('rx','1');
            const r2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            r2.setAttribute('x','14'); r2.setAttribute('y','4'); r2.setAttribute('width','4'); r2.setAttribute('height','16'); r2.setAttribute('rx','1');
            svg.appendChild(r1); svg.appendChild(r2);
        } else {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M8 5v14l11-7z');
            svg.appendChild(path);
        }
        btn.appendChild(svg);
    }

    function swStart() {
        sw.running = true;
        sw.start = performance.now();
        sw.raf = requestAnimationFrame(swUpdate);
        $('btnSwStart').classList.add('running');
        setSwBtnIcon(true);
        $('btnLap').disabled = false;
        $('btnSwReset').disabled = false;
    }

    function swPause() {
        sw.running = false;
        sw.elapsed += performance.now() - sw.start;
        if (sw.raf) { cancelAnimationFrame(sw.raf); sw.raf = null; }
        $('btnSwStart').classList.remove('running');
        setSwBtnIcon(false);
    }

    function swReset() {
        sw.running = false;
        sw.elapsed = 0;
        sw.laps = [];
        if (sw.raf) { cancelAnimationFrame(sw.raf); sw.raf = null; }
        $('swDisplay').textContent = '00:00.00';
        $('btnSwStart').classList.remove('running');
        setSwBtnIcon(false);
        $('btnLap').disabled = true;
        $('btnSwReset').disabled = true;
        const list = $('lapList');
        while (list.firstChild) list.removeChild(list.firstChild);
    }

    function swLap() {
        if (!sw.running) return;
        const totalMs = sw.elapsed + (performance.now() - sw.start);
        const prevTotal = sw.laps.length > 0 ? sw.laps[0].totalMs : 0;
        const lapMs = totalMs - prevTotal;
        sw.laps.unshift({ lapMs, totalMs });
        renderLaps();
    }

    function renderLaps() {
        const list = $('lapList');
        while (list.firstChild) list.removeChild(list.firstChild);
        sw.laps.forEach((l, i) => {
            const div = document.createElement('div');
            div.className = 'lap-item';

            const numSpan = document.createElement('span');
            numSpan.className = 'lap-num';
            numSpan.textContent = '圈 ' + (sw.laps.length - i);

            const timeSpan = document.createElement('span');
            timeSpan.className = 'lap-time';
            timeSpan.textContent = swFormat(l.lapMs);

            const totalSpan = document.createElement('span');
            totalSpan.className = 'lap-total';
            totalSpan.textContent = swFormat(l.totalMs);

            div.appendChild(numSpan);
            div.appendChild(timeSpan);
            div.appendChild(totalSpan);
            list.appendChild(div);
        });
    }

    $('btnSwStart').onclick = () => { sw.running ? swPause() : swStart(); };
    $('btnLap').onclick = swLap;
    $('btnSwReset').onclick = swReset;

    // ==================== World Clock ====================
    // Primary clock: browser timezone by default, refined via IP geolocation.
    // Preset cities: 6 fixed. If visitor's timezone matches a preset, it's skipped in the list.

    const cities = [
        { name: '北京', tz: 'Asia/Shanghai' },
        { name: '东京', tz: 'Asia/Tokyo' },
        { name: '纽约', tz: 'America/New_York' },
        { name: '伦敦', tz: 'Europe/London' },
        { name: '巴黎', tz: 'Europe/Paris' },
        { name: '悉尼', tz: 'Australia/Sydney' },
    ];

    const cityMap = {
        'Asia/Shanghai': '北京', 'Asia/Tokyo': '东京', 'Asia/Seoul': '首尔',
        'Asia/Singapore': '新加坡', 'Asia/Dubai': '迪拜', 'Asia/Kolkata': '孟买',
        'Asia/Bangkok': '曼谷', 'Asia/Jakarta': '雅加达', 'Asia/Hong_Kong': '香港',
        'Asia/Taipei': '台北', 'Europe/Moscow': '莫斯科', 'Europe/London': '伦敦',
        'Europe/Paris': '巴黎', 'Europe/Berlin': '柏林', 'Europe/Rome': '罗马',
        'America/New_York': '纽约', 'America/Chicago': '芝加哥',
        'America/Los_Angeles': '洛杉矶', 'America/Sao_Paulo': '圣保罗',
        'America/Toronto': '多伦多', 'America/Mexico_City': '墨西哥城',
        'Africa/Cairo': '开罗', 'Africa/Johannesburg': '约翰内斯堡',
        'Australia/Sydney': '悉尼', 'Australia/Melbourne': '墨尔本',
        'Pacific/Auckland': '奥克兰',
    };

    function isValidTimezone(tz) {
        try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; }
        catch { return false; }
    }

    function resolveCityName(tz, apiCity) {
        if (cityMap[tz]) return cityMap[tz];
        if (apiCity) return apiCity;
        return '本地';
    }

    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const defaultPreset = cities.find(c => c.tz === browserTz);
    let primaryCity = defaultPreset || { name: resolveCityName(browserTz), tz: browserTz };

    function initClocks() {
        const list = $('clockList');
        // Clear existing content safely
        while (list.firstChild) list.removeChild(list.firstChild);

        const primaryCard = document.createElement('div');
        primaryCard.className = 'clock-card primary';

        const primaryName = document.createElement('span');
        primaryName.className = 'clock-city';
        primaryName.textContent = primaryCity.name;

        const primaryTime = document.createElement('span');
        primaryTime.className = 'clock-time';
        primaryTime.dataset.tz = primaryCity.tz;

        const primaryDate = document.createElement('span');
        primaryDate.className = 'clock-date';
        primaryDate.dataset.tz = primaryCity.tz;

        primaryCard.appendChild(primaryName);
        primaryCard.appendChild(primaryTime);
        primaryCard.appendChild(primaryDate);
        list.appendChild(primaryCard);

        cities.forEach(city => {
            if (city.tz === primaryCity.tz) return;
            const card = document.createElement('div');
            card.className = 'clock-card';

            const name = document.createElement('span');
            name.className = 'clock-city';
            name.textContent = city.name;

            const time = document.createElement('span');
            time.className = 'clock-time';
            time.dataset.tz = city.tz;

            card.appendChild(name);
            card.appendChild(time);
            list.appendChild(card);
        });

        updateClocks();
    }

    function updateClocks() {
        const now = new Date();
        document.querySelectorAll('.clock-time[data-tz]').forEach(el => {
            try {
                el.textContent = now.toLocaleTimeString('zh-CN', {
                    timeZone: el.dataset.tz,
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                });
            } catch { el.textContent = '--:--:--'; }
        });
        document.querySelectorAll('.clock-date[data-tz]').forEach(el => {
            try {
                el.textContent = now.toLocaleDateString('zh-CN', {
                    timeZone: el.dataset.tz,
                    year: 'numeric', month: 'long', day: 'numeric',
                    weekday: 'long'
                });
            } catch { el.textContent = ''; }
        });
    }

    initClocks();
    setInterval(updateClocks, 1000);

    // IP geolocation: only used when browser timezone is unavailable
    if (!browserTz || !isValidTimezone(browserTz)) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        fetch('https://ipapi.co/json/', { signal: controller.signal })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => {
                if (data.error) return;
                if (data.timezone && isValidTimezone(data.timezone)) {
                    primaryCity = { name: resolveCityName(data.timezone, data.city), tz: data.timezone };
                    initClocks();
                }
            })
            .catch(() => {});
    }

    // ==================== Shared ====================

    // Pre-create AudioContext on first user interaction (required by mobile browsers)
    let audioCtx = null;
    function ensureAudioCtx() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        if (audioCtx?.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }
    document.addEventListener('click', ensureAudioCtx, { once: true });
    document.addEventListener('touchstart', ensureAudioCtx, { once: true });

    function playBeep() {
        const ctx = ensureAudioCtx();
        if (!ctx) return;
        [800,1000,800,1000,1200].forEach((f, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.frequency.value = f;
            const t = ctx.currentTime + i * 0.25;
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t); osc.stop(t + 0.2);
        });
    }

    // ==================== Keyboard ====================

    // Track which timer column is focused (0=hour, 1=min, 2=sec)
    let timerCol = 0;
    const timerPickers = [thp, tmp, tsp];

    document.addEventListener('keydown', e => {
        if (document.activeElement?.tagName === 'INPUT') return;

        if (activeTab === 'stopwatch') {
            if (e.key === ' ') { e.preventDefault(); sw.running ? swPause() : swStart(); }
            else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); swLap(); }
            else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); swReset(); }
            return;
        }

        if (activeTab === 'clock') return;

        if (activeTab === 'alarm') {
            const pickerMap = { ArrowUp: [ahp, 1], ArrowDown: [ahp, -1], ArrowRight: [amp, 1], ArrowLeft: [amp, -1] };
            const m = pickerMap[e.key];
            if (m) {
                e.preventDefault();
                const [p, dir] = m;
                for (let i = 0; i < p.step; i++) dir > 0 ? p.shiftUp() : p.shiftDown();
                p.commit(); p.bounce(dir);
            } else if (e.key === ' ') {
                e.preventDefault();
                alarmOn ? cancelAlarm() : setAlarm();
            }
        } else {
            // Timer mode: ArrowRight/Left cycle columns, ArrowUp/Down adjust value
            if (e.key === 'ArrowRight') { e.preventDefault(); timerCol = Math.min(2, timerCol + 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); timerCol = Math.max(0, timerCol - 1); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const p = timerPickers[timerCol];
                const dir = e.key === 'ArrowUp' ? 1 : -1;
                for (let i = 0; i < p.step; i++) dir > 0 ? p.shiftUp() : p.shiftDown();
                p.commit(); p.bounce(dir);
            } else if (e.key === ' ') {
                e.preventDefault();
                cd.interval ? stopCountdown() : startCountdown();
            }
        }
    });

    // ==================== Init ====================

    showNow(); setInterval(showNow, 1000);

    function fetchHitokoto() {
        fetch('https://v1.hitokoto.cn/')
            .then(r => r.json())
            .then(data => { $('hitokoto').textContent = data.hitokoto; })
            .catch(() => {});
    }
    fetchHitokoto();
    setInterval(fetchHitokoto, 300000);
})();
