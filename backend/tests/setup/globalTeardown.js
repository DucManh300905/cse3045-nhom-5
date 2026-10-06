const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = async () => {
    await globalThis.__MONGO_REPLSET__?.stop();
    fs.rmSync(path.join(os.tmpdir(), 'mak-test-uploads'), { recursive: true, force: true });
};
