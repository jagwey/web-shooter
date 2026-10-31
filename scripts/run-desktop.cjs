const { spawn } = require('child_process');
const path = require('path');

const exePath = 'C:\\Users\\Osman\\OneDrive\\Desktop\\projelerim\\apps\\web-shooter\\dist-win\\jagwey-web-shooter.exe';
console.log('Starting Jagwey Web Shooter:', exePath);

const child = spawn(exePath, [], {
  stdio: 'inherit'
});

child.on('error', (err) => {
  console.error('Failed to start Jagwey:', err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  console.log(`Jagwey exited with code ${code}, signal ${signal}`);
  process.exit(code || 0);
});
