from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    
    # 1. Open Stage Display
    stage_page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    stage_page.goto('http://localhost:3000/')
    stage_page.wait_for_timeout(1000)
    print("Stage initially on:", stage_page.evaluate("() => Array.from(document.querySelectorAll('.screen.active')).map(s => s.id)"))
    
    # 2. Open Admin Panel
    admin_page = browser.new_page(viewport={'width': 1280, 'height': 800})
    admin_page.goto('http://localhost:3000/admin.html')
    admin_page.wait_for_selector('#login-password')
    admin_page.fill('#login-password', '1234')
    admin_page.click('button[type="submit"]')
    admin_page.wait_for_selector('#admin-layout', state='visible')
    admin_page.wait_for_timeout(500)
    
    # Navigate to Promo & Casting tab
    admin_page.click('[data-tab="promo-cast"]')
    admin_page.wait_for_timeout(500)
    
    # Click Stage Screen Source: Promo
    print("\nClicking 'Promo' route button in Admin...")
    admin_page.click('.stage-route-btn[data-stage-route="promo"]')
    stage_page.wait_for_timeout(1500)
    
    print("Stage after clicking Promo route:", stage_page.evaluate("() => Array.from(document.querySelectorAll('.screen.active')).map(s => s.id)"))
    
    # Click Scene Director card 3 in Admin
    print("\nClicking 3D Scene Director sub-nav...")
    admin_page.click('[data-promo-sub="scenes"]')
    admin_page.wait_for_timeout(500)
    
    print("Clicking Slide 3 card in Admin...")
    admin_page.click('[data-director-scene="3"]')
    stage_page.wait_for_timeout(1500)
    
    slide3_active = stage_page.evaluate("() => document.getElementById('promoSlide3').classList.contains('slide-active')")
    print(f"Is Stage on Slide 3? {slide3_active}")
    
    stage_page.screenshot(path='stage_after_admin_click.png')
    
    browser.close()
