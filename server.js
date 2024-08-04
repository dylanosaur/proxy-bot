const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { setupBrowser, enableRequestLogging } = require('./util');
const app = express();
const port = 3000;

puppeteer.use(StealthPlugin());

let browser, page;

// Route to start the bot
app.get('/start', async (req, res) => {
  try {
    ({ browser, page } = await setupBrowser());
    await enableRequestLogging(page);
    res.send('Bot started and request logging enabled.');
  } catch (error) {
    console.error('Error starting the bot:', error);
    res.status(500).send('Error starting the bot.');
  }
});

// Route to start spidering
app.get('/spider', async (req, res) => {
  if (!page) {
    return res.status(400).send('Bot not started. Please visit /start first.');
  }

  try {
    const masterList = {};
    const domain = new URL(page.url()).origin;

    async function spider(url) {
      console.log('new spider call, domain', domain, 'listLength', Object.keys(masterList).length)

      if (masterList?.[url]) {
        masterList[url].used = true
        console.log(masterList)
      } else {
        masterList[url] = {'used': true}
        console.log('adding to masterlist', masterList)
      }
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const aTags = await page.$$eval('a', anchors => anchors.map(a => a.href));
      console.log('found these refs', aTags)
      for (const link of aTags) {
        if (link.includes(domain) && !(link in masterList) && Object.keys(masterList).length < 50) {
          let targetUrl = `${link}`
          if (!link.includes('https')) {
            targetUrl = `https://${domain}${link}`
          }
          console.log('adding target url', targetUrl)
          masterList[targetUrl] = {'used': false};


          await spider(targetUrl); // Recursively spider the new link

        }
      }
    }

    await spider(page.url());
    res.send(`Spidering complete. Found ${masterList.size} unique URLs.`);
  } catch (error) {
    console.error('Error during spidering:', error);
    res.status(500).send('Error during spidering.');
  }
});

app.listen(port, () => {
  console.log(`Express server running at http://localhost:${port}`);
});
