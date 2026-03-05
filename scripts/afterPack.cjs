const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
    const appOutDir = context.appOutDir;
    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);

    if (context.packager.platform.name === 'mac') {
        console.log(`\n  • clearing extended attributes for ${appPath}`);
        try {
            execSync(`xattr -cr "${appPath}"`);
            console.log('  • successfully cleared extended attributes');
        } catch (e) {
            console.warn(`  • failed to clear extended attributes: ${e.message}`);
        }
    }
};
