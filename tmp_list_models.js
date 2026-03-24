const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyByHtWMmw_r_pBD2j6bygO1-JGkZYbOBQE';

async function listModels() {
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error listing models:", e);
    }
}
listModels();
