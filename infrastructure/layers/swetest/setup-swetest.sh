#!/bin/bash

# Create directories
mkdir -p nodejs/bin
mkdir -p nodejs/ephe

# Download Swiss Ephemeris test program (swetest) binary
# We'll compile from source for Lambda compatibility
cd nodejs/bin

# Download Swiss Ephemeris source
wget -q https://www.astro.com/ftp/swisseph/swe_unix_src_2.10.03.tar.gz
tar -xzf swe_unix_src_2.10.03.tar.gz
cd src

# Compile swetest for Linux x86_64 (Lambda runtime)
gcc -O2 -Wall -fPIC swetest.c sweph.c swephlib.c swejpl.c swemmoon.c swemplan.c swedate.c swehouse.c swecl.c swehel.c -o ../swetest -lm

# Clean up source files
cd ..
rm -rf src swe_unix_src_2.10.03.tar.gz

# Make binary executable
chmod +x swetest

# Download ephemeris data files (required for calculations)
cd ../ephe

# Download essential ephemeris files for years 1800-2400
# These are the minimal files needed for basic calculations
wget -q https://www.astro.com/ftp/swisseph/ephe/semo_18.se1   # Moon
wget -q https://www.astro.com/ftp/swisseph/ephe/sepl_18.se1   # Planets
wget -q https://www.astro.com/ftp/swisseph/ephe/seas_18.se1   # Asteroids

# Also get the leap seconds file
wget -q https://www.astro.com/ftp/swisseph/ephe/seleapsec.txt

echo "Swiss Ephemeris setup complete!"
echo "Binary location: nodejs/bin/swetest"
echo "Ephemeris data: nodejs/ephe/"

# Check total size
du -sh ../nodejs