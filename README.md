# TimeTo

A minimalist time toolkit in pure HTML — alarm, countdown timer, stopwatch, and world clock, all in one page.

[中文说明](README_zh.md)

## Features

- **Alarm** — scroll-wheel time picker with desktop notifications
- **Countdown** — hours:minutes:seconds picker, pause/resume, beep on completion
- **Stopwatch** — centisecond precision with lap tracking
- **World Clock** — auto-detect local timezone, IP geolocation refinement, 6 preset cities

## Tech

- Pure HTML/CSS/JS, zero dependencies, no build step
- Custom scroll-wheel component with drag inertia, mouse wheel, and keyboard support
- Web Audio API beep alerts
- Responsive layout: sidebar nav on desktop, bottom tab bar on mobile

## Files

| File | Description |
|------|-------------|
| `index.html` | Page structure |
| `style.css` | Styles |
| `app.js` | Application logic |
