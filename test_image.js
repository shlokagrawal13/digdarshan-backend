const https = require('https');

async function testDownload() {
    const url = 'https://c.ndtvimg.com/2023-11/abc_625x300_15_November_23.jpg';

    const reqs = [
        { name: 'No Headers', headers: {} },
        { name: 'Curl', headers: { 'User-Agent': 'curl/7.81.0', 'Accept': '*/*' } },
        { name: 'Browser', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
    ];

    for (let req of reqs) {
        try {
            const res = await fetch(url, { headers: req.headers });
            console.log(`${req.name} -> Status: ${res.status}`);
        } catch (e) {
            console.error(`${req.name} -> Failed: ${e.message}`);
        }
    }
}
testDownload();
