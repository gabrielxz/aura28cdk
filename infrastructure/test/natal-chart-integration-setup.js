// This file sets up the module resolution for the integration test
const path = require('path');
const Module = require('module');

// Add layer node_modules to the require paths
const layerNodeModules = path.join(__dirname, '../layers/swetest/layer/nodejs/node_modules');

// Override module resolution for swisseph
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain) {
  if (request === 'swisseph') {
    try {
      const swissephPath = path.join(layerNodeModules, 'swisseph');
      return originalResolveFilename.call(this, swissephPath, parent, isMain);
    } catch (e) {
      // Fallback to normal resolution
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain);
};

// Set ephemeris paths
const ephePath = path.join(layerNodeModules, 'swisseph', 'ephe');
process.env.SE_EPHE_PATH = ephePath;
process.env.EPHEMERIS_PATH = ephePath;
process.env.NODE_ENV = 'test';

console.log('Test setup complete:', {
  layerNodeModules,
  ephePath,
  SE_EPHE_PATH: process.env.SE_EPHE_PATH,
  EPHEMERIS_PATH: process.env.EPHEMERIS_PATH
});