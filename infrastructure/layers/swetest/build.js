const fs = require('fs');
const path = require('path');

// Create the required directory structure for Lambda Layer
const layerDir = path.join(__dirname, 'nodejs');
const binDir = path.join(layerDir, 'bin');
const epheDir = path.join(layerDir, 'ephe');

// Create directories
if (!fs.existsSync(layerDir)) fs.mkdirSync(layerDir, { recursive: true });
if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
if (!fs.existsSync(epheDir)) fs.mkdirSync(epheDir, { recursive: true });

// Copy swisseph module to nodejs directory for Lambda Layer
const srcSwisseph = path.join(__dirname, 'node_modules', 'swisseph');
const destSwisseph = path.join(layerDir, 'node_modules', 'swisseph');

if (!fs.existsSync(path.join(layerDir, 'node_modules'))) {
  fs.mkdirSync(path.join(layerDir, 'node_modules'), { recursive: true });
}

// Copy the entire swisseph module
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursiveSync(srcSwisseph, destSwisseph);

// Create a wrapper module that exports swisseph
const wrapperContent = `
// Swiss Ephemeris wrapper for Lambda Layer
const swisseph = require('swisseph');

module.exports = swisseph;
`;

fs.writeFileSync(path.join(layerDir, 'swisseph-wrapper.js'), wrapperContent);

console.log('Lambda Layer structure created successfully!');
console.log('Layer directory:', layerDir);
console.log('Total size:', require('child_process').execSync(`du -sh ${layerDir}`).toString().trim());