const https = require('https');
const http = require('http');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function test() {
  console.log("Testing yahoo raw...");
  let res = await fetch('https://query2.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=3mo');
  console.log("yahoo status:", res.status);

  console.log("Testing allorigins proxy...");
  res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://query2.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=3mo'));
  console.log("proxy status:", res.status);
  
  console.log("Testing thingproxy...");
  res = await fetch('https://thingproxy.freeboard.io/fetch/' + encodeURIComponent('https://query2.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=3mo'));
  console.log("thingproxy status:", res.status);
}

test();
