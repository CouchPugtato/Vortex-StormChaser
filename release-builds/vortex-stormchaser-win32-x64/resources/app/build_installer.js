const electronInstaller = require('electron-winstaller');
const path = require('path');

async function build() {
    console.log('Creating windows installer (this may take a while)...');
    
    try {
        await electronInstaller.createWindowsInstaller({
            appDirectory: path.join(__dirname, 'release-builds/vortex-stormchaser-win32-x64'),
            outputDirectory: path.join(__dirname, 'release-builds/installer'),
            authors: 'Vortex StormChaser',
            exe: 'vortex-stormchaser.exe',
            // iconUrl: 'https://raw.githubusercontent.com/username/repo/master/vortex.ico', 
            setupIcon: path.join(__dirname, 'vortex.ico'),
            name: 'vortex_stormchaser',
            description: 'FRC Field Mapper Application',
            noMsi: true
        });
        console.log('Installer created successfully in release-builds/installer');
    } catch (e) {
        console.log(`Error creating installer: ${e.message}`);
    }
}

build();