#!/bin/bash

# Build script for Swiss Ephemeris Lambda Layer
# This creates an optimized layer with only essential ephemeris files

set -e

echo "Building Swiss Ephemeris Lambda Layer..."

# Clean up existing layer directory
if [ -d "layer" ]; then
  echo "Removing existing layer directory..."
  rm -rf layer
fi

# Create layer structure
mkdir -p layer/nodejs

# Copy package files
cp package.json layer/nodejs/
cp package-lock.json layer/nodejs/

# Install dependencies in layer directory
echo "Installing swisseph module..."
cd layer/nodejs
npm ci --omit=dev
cd ../..

# Optimize ephemeris files - keep only essential ones
EPHE_DIR="layer/nodejs/node_modules/swisseph/ephe"
if [ -d "$EPHE_DIR" ]; then
  echo "Optimizing ephemeris files..."
  
  # List all files before optimization
  echo "Original ephemeris files:"
  ls -lh "$EPHE_DIR"
  
  # Essential files for house calculations
  ESSENTIAL_FILES=(
    "semo_18.se1"     # Moon ephemeris (1.3MB)
    "sepl_18.se1"     # Planets ephemeris (484KB)
    "seas_18.se1"     # Asteroids ephemeris (223KB)
    "seleapsec.txt"   # Leap seconds (< 1KB)
    "seorbel.txt"     # Orbital elements (6KB)
    "sefstars.txt"    # Fixed stars (133KB)
  )
  
  # Create temp directory for essential files
  mkdir -p "$EPHE_DIR.tmp"
  
  # Copy only essential files
  for file in "${ESSENTIAL_FILES[@]}"; do
    if [ -f "$EPHE_DIR/$file" ]; then
      echo "Keeping essential file: $file"
      cp "$EPHE_DIR/$file" "$EPHE_DIR.tmp/"
    else
      echo "Warning: Essential file not found: $file"
    fi
  done
  
  # Replace original directory with optimized one
  rm -rf "$EPHE_DIR"
  mv "$EPHE_DIR.tmp" "$EPHE_DIR"
  
  echo "Optimized ephemeris files:"
  ls -lh "$EPHE_DIR"
  
  # Calculate total size
  TOTAL_SIZE=$(du -sh "$EPHE_DIR" | cut -f1)
  echo "Total ephemeris data size: $TOTAL_SIZE"
else
  echo "Error: Ephemeris directory not found at $EPHE_DIR"
  exit 1
fi

# Validate layer structure
echo "Validating layer structure..."
if [ ! -d "layer/nodejs/node_modules/swisseph" ]; then
  echo "Error: swisseph module not found in layer"
  exit 1
fi

if [ ! -d "layer/nodejs/node_modules/swisseph/ephe" ]; then
  echo "Error: ephemeris data directory not found in layer"
  exit 1
fi

# Check for essential files
for file in "${ESSENTIAL_FILES[@]}"; do
  if [ ! -f "layer/nodejs/node_modules/swisseph/ephe/$file" ]; then
    echo "Error: Essential file missing: $file"
    exit 1
  fi
done

# Report final layer size
LAYER_SIZE=$(du -sh layer/nodejs | cut -f1)
echo "Successfully built Swiss Ephemeris layer: $LAYER_SIZE"
echo "Layer is ready for deployment at: $(pwd)/layer"

# Verify architecture compatibility
NODE_ARCH=$(node -p "process.arch")
NODE_PLATFORM=$(node -p "process.platform")
echo "Built on: $NODE_PLATFORM/$NODE_ARCH"
echo "Note: Ensure Lambda runtime matches this architecture"