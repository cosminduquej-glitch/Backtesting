const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:5173', { waitUntil: 'load' });
  await page.evaluate(() => {
    try {
      if (window.chartRef) {
        console.log("Chart methods:", Object.keys(window.chartRef));
      }
    } catch(e) {}
  });
  await browser.close();
})();
