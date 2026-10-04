from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    
    logs = []
    page.on('console', lambda msg: logs.append(f"CONSOLE: {msg.text}"))
    page.on('pageerror', lambda err: logs.append(f"PAGE ERROR: {err}"))
    
    page.goto('http://localhost:3000/')
    page.wait_for_timeout(1000)
    
    # 1. Check which screen is active
    active_screens = page.evaluate("""() => {
        return Array.from(document.querySelectorAll('.screen.active')).map(s => s.id);
    }""")
    print(f"Initially active screens: {active_screens}")
    
    # 2. Switch to promo screen
    page.evaluate("""() => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screenPromo').classList.add('active');
        currentScreen = 'promo';
    }""")
    page.wait_for_timeout(500)
    
    # 3. Test clicking dot 2
    print("\n--- Clicking dot 2 ---")
    page.click('.reel-dot-btn[data-scene="2"]')
    page.wait_for_timeout(800)
    
    slide2_active = page.evaluate("""() => {
        return document.getElementById('promoSlide2').classList.contains('slide-active');
    }""")
    print(f"Is Slide 2 active after clicking dot 2? {slide2_active}")
    
    # 4. Test clicking Next button
    print("\n--- Clicking Next button ---")
    page.click('#btnPromoNext')
    page.wait_for_timeout(800)
    
    slide3_active = page.evaluate("""() => {
        return document.getElementById('promoSlide3').classList.contains('slide-active');
    }""")
    print(f"Is Slide 3 active after clicking Next? {slide3_active}")
    
    # 5. Test pressing key '4'
    print("\n--- Pressing key '4' ---")
    page.keyboard.press('4')
    page.wait_for_timeout(800)
    
    slide4_active = page.evaluate("""() => {
        return document.getElementById('promoSlide4').classList.contains('slide-active');
    }""")
    print(f"Is Slide 4 active after pressing '4'? {slide4_active}")
    
    # 6. Test clicking Prev button
    print("\n--- Clicking Prev button ---")
    page.click('#btnPromoPrev')
    page.wait_for_timeout(800)
    
    slide3_back_active = page.evaluate("""() => {
        return document.getElementById('promoSlide3').classList.contains('slide-active');
    }""")
    print(f"Is Slide 3 active after clicking Prev? {slide3_back_active}")
    
    # 7. Test Admin panel triggering scene 5
    print("\n--- Testing Admin socket trigger ---")
    page.evaluate("""() => {
        if (socket) socket.emit('promo:control', { action: 'scene', scene: '5' });
    }""")
    page.wait_for_timeout(800)
    
    slide5_active = page.evaluate("""() => {
        return document.getElementById('promoSlide5').classList.contains('slide-active');
    }""")
    print(f"Is Slide 5 active after socket promo:control '5'? {slide5_active}")

    page.close()
    browser.close()
