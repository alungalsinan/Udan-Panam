from playwright.sync_api import sync_playwright

for page_url in ['http://localhost:3000/', 'http://localhost:3000/cast.html', 'http://localhost:3000/admin.html']:
    print(f"\n--- Checking {page_url} ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
        page = browser.new_page()
        
        errors = []
        page.on('pageerror', lambda err: errors.append(f"PAGE ERROR: {err}"))
        page.on('console', lambda msg: errors.append(f"CONSOLE {msg.type}: {msg.text}") if msg.type in ['error', 'warning'] else None)
        
        try:
            page.goto(page_url, wait_until='networkidle')
            page.wait_for_timeout(1000)
        except Exception as e:
            print(f"Goto error: {e}")
            
        for err in errors:
            print(err)
            
        browser.close()
