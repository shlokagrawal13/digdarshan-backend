const axios = require('axios');

async function testDownload() {
    const urls = [
        'https://wsrv.nl/?url=c.ndtvimg.com/2023-11/abc_625x300_15_November_23.jpg',
        'https://wsrv.nl/?url=feeds.abplive.com/onecms/images/uploaded-images/2024/05/17/c97b8ea79de42b2ab672be9cce54d3a01715939226500582_original.jpg'
    ];

    for (let url of urls) {
        try {
            console.log('Testing WSRV: ' + url);
            const res = await axios.get(url, { responseType: 'arraybuffer' });
            console.log(`Success! Status: ${res.status}, Length: ${res.data.length}`);
        } catch (e) {
            console.error(`Failed! Error: ${e.response ? e.response.status : e.message}`);
        }
    }
}
testDownload();
