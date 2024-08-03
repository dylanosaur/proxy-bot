const { setupBrowser, enableRequestLogging } = require('./util');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

// this will start up a chrome instance with request logging to a local dir
(async () => {

    let {browser, page} = await setupBrowser()
    // console.log(page)
    await enableRequestLogging(page);
})()