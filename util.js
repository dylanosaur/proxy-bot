const puppeteer = require('puppeteer');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');


async function setupBrowser() {
  const browser = await puppeteer.launch({
    headless: false,
    timeout: 60000,
    args: [
      '--disable-notifications',
      '--enable-features=ExperimentalJavaScript',
      // '--start-maximized'
    ]
  }); // Launch browser
  const page = await browser.newPage(); // Create a new page
  // await page.setViewport({ width: 1920, height: 1080 });
  return { browser, page }
}

function requestContainsKeyword(request, words) {

  let hit = false
  // ignore cookie hits bc often username and emaila are in cookies
  let headersCopy = JSON.parse(JSON.stringify(request.headers()))
  headersCopy.cookie = ''
  headersCopy.referer = ''
  for (let matchWord of words) {
    if (request.url().includes(matchWord) || 
    JSON.stringify(headersCopy).includes(matchWord)  ||
    JSON.stringify(request.postData() || {}).includes(matchWord)) {
      hit = true
      return matchWord
    }
  }
  return null
}


async function enableRequestLogging(page) {
  // Enable request interception
  await page.setRequestInterception(true);

  page.on('request', async request => {

    let email = 'dylan.adams.10642@gmail.com'
    let username = 'dylanadams10642'
    let urlEncodedEmail = 'dylan.adams.10642%40gmail.com'
    let matchWords = [email, urlEncodedEmail, username]
    const requestData = {
      url: request.url(),
      headers: request.headers(),
      method: request.method(),
      postData: request.postData()
    };

    if (requestContainsKeyword(request, matchWords)) {

      let matchWord = requestContainsKeyword(request, matchWords)
      requestData.matchWord = matchWord

      const hash = crypto.createHash('sha256').update(request.url() + JSON.stringify(request.headers())).digest('hex').slice(0,6);
    

      // Log the request details to a file
      const url = new URL(request.url());
      const hostname = url.hostname;
      const pathname = url.pathname.replace(/\//g, '_');

      // Create the directory if it doesn't exist
      const dir = path.resolve(__dirname, 'requests', hostname);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const filePath = path.join(dir, `${pathname}-${hash}.json`);

      fs.writeFileSync(filePath, JSON.stringify(requestData, null, 2));

      console.log(`Logged request to: ${filePath}`);

      page.on('response', async response => {
        if (response.url() === request.url()) {
          let bodyText = ''
          try {
            bodyText = await response.text()
            try {
              bodyText = JSON.parse(bodyText)
            } catch(e) {
              // do nothing
            }
          } catch(e) {
            bodyText = 'redirect response'
          }
          const responseFilePath = path.join(dir, `${pathname}-${hash}-response.json`);
          const responseData = {
            url: response.url(),
            status: response.status(),
            headers: response.headers(),
            responseText: bodyText
          };
          requestData.response = responseData

          fs.writeFileSync(responseFilePath, JSON.stringify(requestData, null, 2));

          console.log(`Logged response to: ${responseFilePath}`);
        }
      });
    }


    request.continue();
  });
}

async function replayRequest(url, method, headers, postData) {
  try {
    const response = await axios({
      url,
      method,
      headers,
      data: postData
    });

    // console.log('Response data:', response.data);
    return response.data
  } catch (error) {
    console.error('Error replaying request:', error);
  }
}


module.exports = {
  setupBrowser,
  replayRequest,
  enableRequestLogging
}