# TV UI Testing & Deployment Guide

## Overview
This guide covers testing and deploying the Doctor Queue System on various TV browsers and operating systems. The application uses a sophisticated viewport detection system and responsive CSS to adapt to different TV screen sizes and OSes.

## TV OS Compatibility Matrix

| TV OS | Browser | Viewport Detection | CSS Grid | Fonts | Animations | Notes |
|-------|---------|-------------------|----------|-------|------------|-------|
| **Samsung Tizen** (2017+) | Web Browser | ⚠️ Partial | ✅ | ✅ | ✅ | Disable "Auto Zoom" in settings |
| **LG webOS** (3.0+) | Web Browser | ⚠️ Partial | ✅ | ✅ | ✅ | Enable "Desktop Mode" |
| **Android TV** (8.0+) | Chrome/Firefox | ✅ Good | ✅ | ✅ | ✅ | Enable "Desktop Site" |
| **Fire TV** | Silk/Firefox | ⚠️ Limited | ⚠️ | ⚠️ | ⚠️ | Sideload Firefox recommended |
| **Google TV / Chromecast** | Chrome | ✅ Good | ✅ | ✅ | ✅ | Kiosk mode works well |
| **Roku** | Roku Browser | ❌ Limited | ❌ | ❌ | ❌ | Not recommended |
| **Generic/Other** | Varies | ⚠️ Varies | ⚠️ | ⚠️ | ⚠️ | Test individually |

## Key Issues & Solutions

### 1. Viewport Detection Issues
**Problem**: TV browsers often report incorrect `innerWidth`/`innerHeight`
- Samsung Tizen: May report mobile viewport (360px) on 1080p TV
- LG webOS: Sometimes reports half height
- Android TV: Usually accurate with Chrome

**Solution**: Our `useTvViewport.ts` hook uses multiple fallbacks:
```typescript
// Priority order:
1. window.visualViewport (most accurate)
2. document.documentElement.clientWidth/Height
3. window.innerWidth/Height
4. window.screen.width/Height (last resort)
```

### 2. Font Rendering Issues
**Problem**: Noto Sans Devanagari/Gujarati may not load or render correctly
- Some TV browsers don't support `font-display: swap`
- `font-variant-numeric: tabular-nums` not supported on older browsers

**Solution**: 
- Preload fonts in HTML `<head>` with `<link rel="preload">`
- Provide `@font-face` fallbacks with `font-display: swap`
- Use system font stack as ultimate fallback

### 3. CSS Grid Layout Issues
**Problem**: Grid with `minmax(0, 1fr)` can overflow on some TV browsers
- 5-card layout uses 6-column track on wide screens
- Portrait mode forces single column

**Solution**:
- Added `grid-auto-flow: dense` to prevent gaps
- `min-width: 0` on grid children prevents overflow
- Media queries for `max-height: 800px` (720p TVs)

### 4. Text Size & Readability
**Problem**: Text too small to read from viewing distance
- 10-foot UI requires minimum 24px for body text
- Token numbers need 60px+ at 1080p

**Solution**:
- Minimum `--tv-u` of 8px (enforced in hook)
- `clamp()` functions with generous minimums
- `font-variant-numeric: tabular-nums` for stable token width

## Testing Checklist

### Pre-Deployment Testing
- [ ] Open `tv-test-page.html` on target TV browser
- [ ] Verify viewport metrics match physical screen
- [ ] Check TV OS detection badge shows correct OS
- [ ] Verify `--tv-u` custom property ≥ 8px
- [ ] Test token numerals render crisply (no blur)
- [ ] Verify Devanagari/Gujarati text displays
- [ ] Test grid layouts at different orientations
- [ ] Verify token flash animation works
- [ ] Test with TV remote (focus navigation)

### On-Site Testing
- [ ] Test from actual viewing distance (3-5 meters)
- [ ] Verify readability in ambient lighting
- [ ] Test page rotation with 6+ doctors
- [ ] Test "Now Calling" banner visibility
- [ ] Test language switching (Marathi/English/Gujarati)
- [ ] Test announcement toggle
- [ ] Verify no horizontal scrolling
- [ ] Test with actual hospital data

### Performance Testing
- [ ] Page load time < 3 seconds on TV
- [ ] Smooth 60fps animations
- [ ] No memory leaks during long rotation (24hr+)
- [ ] Reconnection handling after network loss
- [ ] Supabase realtime subscription stability

## Deployment Configuration

### 1. HTML Head Optimizations
Add to `index.html`:
```html
<!-- Preload critical fonts -->
<link rel="preload" as="font" type="font/woff2" crossorigin 
  href="https://fonts.gstatic.com/s/notosansdevanagari/vXX/...woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin 
  href="https://fonts.gstatic.com/s/notosansgujarati/vXX/...woff2">

<!-- Disable translation (already present) -->
<meta name="google" content="notranslate">
<html translate="no" class="notranslate">

<!-- Viewport for TV -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

### 2. CSP Headers (if using custom server)
```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  img-src 'self' data: blob:;
  frame-ancestors 'none';
```

### 3. Nginx/Apache Config for TV
```nginx
# Enable compression
gzip on;
gzip_types text/css application/javascript application/json;

# Cache static assets
location /assets/ {
  expires 1y;
  add_header Cache-Control "public, immutable";
}

# SPA fallback
location / {
  try_files $uri $uri/ /index.html;
}

# Disable buffering for realtime
proxy_buffering off;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

## Debugging Tools

### 1. TV Debug Overlay
Add `?tvdebug=1` to URL to show:
- Shell dimensions
- Viewport metrics
- CSS custom property values
- Screen vs visual viewport comparison

### 2. Console Commands
```javascript
// Check current viewport metrics
console.log(window.__TV_VIEWPORT_METRICS__);

// Force viewport recalculation
window.dispatchEvent(new Event('resize'));

// Check TV OS detection
console.log(document.documentElement.dataset.tvOs);

// Test token flash
document.querySelectorAll('.token-digits').forEach(el => el.classList.add('token-flash'));
```

### 3. Remote Debugging
- **Android TV**: `adb connect <ip>:5555` → Chrome DevTools
- **Fire TV**: `adb connect <ip>:5555` → Chrome DevTools
- **webOS**: WebOS IDE or `ares-inspect`
- **Tizen**: Tizen Studio → Remote Device Manager

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Text tiny on 4K TV | `--tv-u` too small | Ensure minimum 8px in hook |
| Grid stacks vertically | Aspect ratio detection wrong | Check `data-tv-wide` attribute |
| Fonts not loading | CSP blocking Google Fonts | Add `fonts.gstatic.com` to font-src |
| Tokens shift width | `tabular-nums` not supported | Add `font-variant-numeric: lining-nums tabular-nums` |
| Page cuts off bottom | `max-height: 800px` media query | Adjust breakpoint or reduce header |
| Animation jank | TV GPU limited | Reduce animation complexity |
| Language not switching | Translation blocking | Ensure `translate="no"` on html |
| Reconnection fails | TV sleep mode | Add visibilitychange listener |

## TV-Specific CSS Classes

The application sets these data attributes on the root shell:
- `data-tv-wide="true/false"` - 16:9 or wider
- `data-tv-ultrawide="true/false"` - 21:9 or wider
- `data-tv-portrait="true/false"` - Portrait orientation
- `data-tv-os="tizen|webos|android-tv|fire-tv|..."` - Detected OS

Use these in custom CSS:
```css
/* Samsung Tizen specific */
[data-tv-os="tizen"] .tv-token-card { font-size: clamp(4rem, 8vw, 48rem); }

/* Low height TV (720p) */
@media (max-height: 800px) {
  .display-header { padding: 0.5rem; }
  .display-date { display: none; }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .tv-card.highlighted { border: 4px solid white; }
}
```

## Maintenance

### Monthly Checks
- [ ] Test on all supported TV OSes
- [ ] Verify font loading (Google Fonts CDN)
- [ ] Check Supabase realtime performance
- [ ] Review error logs for TV-specific issues

### Quarterly Updates
- [ ] Update User Agent detection for new TV models
- [ ] Test with latest TV firmware
- [ ] Review and update viewport detection logic
- [ ] Performance audit on lowest-spec TV

## Emergency Rollback
If TV UI breaks in production:
1. Revert to previous build: `git revert HEAD` + deploy
2. Or disable TV optimizations temporarily:
   ```css
   /* Emergency fallback - add to index.css */
   .tv-token-card { font-size: 5rem !important; }
   .tv-grid { grid-template-columns: 1fr !important; }
   ```

## Support Contacts
- **Internal**: Dev team - check `@session:default/...` for previous TV debugging sessions
- **External**: TV manufacturer developer portals for browser specs

---

*Last updated: Based on codebase analysis of Doctor Queue System v1.0.0*
*Test page: `fixes/tv-test-page.html` - deploy to test on target TVs*